import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createSeed } from './seed.js';
const collections = {
  members: 'users',
  projects: 'projects',
  tasks: 'tasks',
  events: 'project_events',
  snapshots: 'project_snapshots',
};
export async function createStore(options = {}) {
  const requested = options.store ?? process.env.STORE;
  if (requested && !['file', 'mongo', 'mongodb'].includes(requested))
    throw new Error('STORE must be file or mongo');
  const uri = requested === 'file' ? undefined : (options.mongoUri ?? process.env.MONGODB_URI);
  if ((requested === 'mongo' || requested === 'mongodb') && !uri)
    throw new Error('MONGODB_URI is required with STORE=mongo');
  const mode = uri ? 'mongodb' : 'file';
  let state, client, database, filename;
  const demo = options.demo ?? process.env.DEMO_MODE !== 'false';
  const seed = () => {
    if (!demo && !(options.adminPassword || process.env.ADMIN_PASSWORD))
      throw new Error('ADMIN_PASSWORD is required when DEMO_MODE=false');
    if (!demo && (options.adminPassword || process.env.ADMIN_PASSWORD).length < 12)
      throw new Error('ADMIN_PASSWORD must have at least 12 characters');
    return createSeed({
      demo,
      adminEmail: options.adminEmail || process.env.ADMIN_EMAIL,
      adminPassword: options.adminPassword || process.env.ADMIN_PASSWORD,
    });
  };
  if (uri) {
    const { MongoClient } = await import('mongodb');
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    database = client.db(options.dbName || process.env.MONGODB_DATABASE || 'orbit');
    for (const [key, name] of Object.entries(collections)) {
      await database.collection(name).createIndex({ id: 1 }, { unique: true });
      if (key !== 'members' && key !== 'projects')
        await database.collection(name).createIndex({ projectId: 1 });
    }
    await database.collection('users').createIndex({ email: 1 }, { unique: true });
    await database.collection('tasks').createIndex({ projectId: 1, status: 1, dueDate: 1 });
    await database.collection('project_events').createIndex({ projectId: 1, createdAt: -1 });
    state = {};
    for (const [key, name] of Object.entries(collections))
      state[key] = await database
        .collection(name)
        .find({}, { projection: { _id: 0 } })
        .toArray();
    if (!state.members.length) state = seed();
  } else {
    const directory = path.resolve(options.dataDir || process.env.DATA_DIR || '.data');
    await mkdir(directory, { recursive: true });
    filename = path.join(directory, 'orbit.json');
    try {
      state = JSON.parse(await readFile(filename, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = seed();
    }
  }
  async function persist(next, previous) {
    if (database) {
      for (const [key, name] of Object.entries(collections)) {
        const before = new Map((previous?.[key] || []).map((v) => [v.id, v]));
        const after = new Map(next[key].map((v) => [v.id, v]));
        const changes = next[key]
          .filter((v) => JSON.stringify(before.get(v.id)) !== JSON.stringify(v))
          .map((v) => ({ replaceOne: { filter: { id: v.id }, replacement: v, upsert: true } }));
        for (const id of before.keys())
          if (!after.has(id)) changes.push({ deleteOne: { filter: { id } } });
        if (changes.length) await database.collection(name).bulkWrite(changes, { ordered: true });
      }
    } else {
      const temporary = `${filename}.tmp`;
      await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
      await rename(temporary, filename);
    }
  }
  await persist(state);
  let queue = Promise.resolve();
  return {
    mode,
    demo,
    read: () => structuredClone(state),
    aggregateProject: async (projectId) => {
      if (!database) return null;
      const [summary] = await database
        .collection('tasks')
        .aggregate([
          { $match: { projectId } },
          {
            $group: {
              _id: null,
              taskCount: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
              plannedHours: { $sum: '$plannedHours' },
              actualHours: { $sum: '$actualHours' },
              weightedProgress: { $sum: { $multiply: ['$progress', '$plannedHours'] } },
              totalProgress: { $sum: '$progress' },
            },
          },
          {
            $project: {
              _id: 0,
              taskCount: 1,
              completed: 1,
              plannedHours: 1,
              actualHours: 1,
              progress: {
                $floor: {
                  $add: [
                    {
                      $cond: [
                        { $gt: ['$plannedHours', 0] },
                        { $divide: ['$weightedProgress', '$plannedHours'] },
                        { $divide: ['$totalProgress', '$taskCount'] },
                      ],
                    },
                    0.5,
                  ],
                },
              },
            },
          },
        ])
        .toArray();
      const statuses = await database
        .collection('tasks')
        .aggregate([
          { $match: { projectId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $project: { _id: 0, status: '$_id', count: 1 } },
        ])
        .toArray();
      return {
        ...(summary || {
          taskCount: 0,
          completed: 0,
          plannedHours: 0,
          actualHours: 0,
          progress: 0,
        }),
        statuses,
      };
    },
    mutate: (operation) => {
      const result = queue.then(async () => {
        const next = structuredClone(state);
        const value = await operation(next);
        try {
          await persist(next, state);
        } catch (error) {
          // A standalone Mongo server cannot atomically commit changes across collections.
          // Refresh after a failed write so the next request never uses stale cached data.
          if (database)
            for (const [key, name] of Object.entries(collections))
              state[key] = await database
                .collection(name)
                .find({}, { projection: { _id: 0 } })
                .toArray();
          throw error;
        }
        state = next;
        return value;
      });
      queue = result.catch(() => {});
      return result;
    },
    close: async () => {
      await queue;
      await client?.close();
    },
  };
}
