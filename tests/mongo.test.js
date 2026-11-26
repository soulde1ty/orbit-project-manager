import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createStore } from '../server/store.js';
import { analytics } from '../shared/metrics.js';

test(
  'MongoDB persists tasks, comments, snapshots and matches the shared analytics engine',
  { skip: !process.env.MONGODB_TEST_URI },
  async () => {
    const uri = process.env.MONGODB_TEST_URI;
    const dbName = `orbit_test_${randomUUID().replaceAll('-', '')}`;
    const client = new MongoClient(uri);
    let store;
    try {
      await client.connect();
      store = await createStore({ store: 'mongo', mongoUri: uri, dbName, demo: true });
      assert.equal(store.mode, 'mongodb');
      const pid = store.read().projects[0].id;
      const initial = store.read();
      const baseline = initial.snapshots.find((s) => s.projectId === pid);
      await store.mutate((state) => {
        const task = state.tasks.find((t) => t.projectId === pid && t.status !== 'done');
        task.status = 'done';
        task.progress = 100;
        task.actualHours = 42;
        task.comments = [
          {
            id: 'comment-test',
            text: 'Mongo persistence',
            authorName: 'QA',
            createdAt: new Date().toISOString(),
          },
        ];
        state.snapshots.push({
          id: 'snapshot-test',
          projectId: pid,
          name: 'After completion',
          createdAt: new Date().toISOString(),
          metrics: analytics(pid, state),
        });
      });
      const expected = analytics(pid, store.read());
      const actual = await store.aggregateProject(pid);
      for (const key of ['taskCount', 'completed', 'plannedHours', 'actualHours', 'progress'])
        assert.equal(actual[key], expected[key], key);
      assert.equal(
        actual.statuses.reduce((n, s) => n + s.count, 0),
        expected.taskCount,
      );
      assert.deepEqual(
        store.read().snapshots.find((s) => s.id === baseline.id),
        baseline,
        'snapshots must stay immutable',
      );
      await store.close();
      store = await createStore({ store: 'mongo', mongoUri: uri, dbName, demo: true });
      assert.equal(
        store.read().tasks.some((t) => t.comments?.some((c) => c.text === 'Mongo persistence')),
        true,
      );
      assert.equal(
        store.read().snapshots.find((s) => s.id === 'snapshot-test').metrics.completed,
        expected.completed,
      );
      const indexes = await client.db(dbName).collection('tasks').indexes();
      assert.ok(indexes.some((i) => i.key.projectId && i.key.status && i.key.dueDate));
      await store.mutate((state) => {
        state.tasks = state.tasks.filter((t) => t.projectId !== pid);
      });
      assert.equal((await store.aggregateProject(pid)).taskCount, 0);
      await assert.rejects(
        client
          .db(dbName)
          .collection('users')
          .insertOne({ ...store.read().members[0] }),
        /duplicate key/,
      );
    } finally {
      await store?.close();
      // Remove only the uniquely named test database created above.
      if (!dbName.startsWith('orbit_test_')) throw new Error('Invalid test database');
      await client.db(dbName).dropDatabase();
      await client.close();
    }
  },
);
