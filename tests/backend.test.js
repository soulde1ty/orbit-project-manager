import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { calculateRisk, expectedProgress, analytics } from '../server/risk.js';

test('risk is bounded, weighted, date aware, and zero after completion', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  const task = {
    id: 't',
    assigneeId: 'u',
    status: 'blocked',
    progress: 0,
    plannedHours: 100,
    actualHours: 0,
    startDate: '2026-06-01',
    dueDate: '2026-06-10',
    updatedAt: '2026-06-01T00:00:00Z',
    dependencies: [],
  };
  const members = [{ id: 'u', capacityHours: 10 }];
  assert.equal(calculateRisk(task, [task], members, now).score, 1);
  assert.equal(calculateRisk({ ...task, status: 'done' }, [task], members, now).score, 0);
  assert.equal(expectedProgress(task, now), 100);
  assert.equal(
    expectedProgress({ ...task, startDate: '2026-07-01', dueDate: '2026-07-02' }, now),
    0,
  );
  const t2 = { ...task, id: 't2', projectId: 'p', plannedHours: 0, progress: 50 };
  assert.equal(analytics('p', { tasks: [t2], members }, now).progress, 50);
  const farFuture = {
    ...task,
    status: 'todo',
    startDate: '2026-07-01',
    dueDate: '2026-07-10',
    updatedAt: now.toISOString(),
    plannedHours: 1,
  };
  assert.equal(calculateRisk(farFuture, [farFuture], members, now).score, 0);
});

test('API validates, enforces access, preserves changes, snapshots and comments', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
  const store = await createStore({ dataDir, store: 'file', demo: true });
  const server = createApp(store).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  let cookie = '';
  async function call(url, method = 'GET', body, customCookie = cookie, headers = {}) {
    const response = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(customCookie ? { Cookie: customCookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie'),
    };
  }
  assert.equal((await call('/api/bootstrap')).status, 401);
  assert.equal(
    (await call('/api/auth/login', 'POST', { email: 'demo@orbit.local', password: 'wrong' }))
      .status,
    401,
  );
  const login = await call('/api/auth/login', 'POST', {
    email: 'demo@orbit.local',
    password: 'OrbitDemo2026!',
  });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly/);
  assert.match(login.cookie, /SameSite=Strict/);
  cookie = login.cookie.split(';')[0];
  const boot = await call('/api/bootstrap');
  assert.equal(boot.data.tasks.length, 18);
  assert.equal(
    boot.data.members.some((m) => 'passwordHash' in m),
    false,
  );
  assert.equal(
    (
      await call('/api/projects', 'POST', {
        name: 'x',
        startDate: '2026-99-01',
        dueDate: '2026-12-01',
      })
    ).status,
    400,
  );
  assert.equal(
    (await call('/api/projects', 'POST', {}, cookie, { Origin: 'https://evil.invalid' })).status,
    403,
  );
  const created = await call('/api/projects', 'POST', {
    name: 'Test project',
    startDate: '2026-11-01',
    dueDate: '2026-11-30',
  });
  assert.equal(created.status, 201);
  const pid = created.data.id;
  const fields = {
    projectId: pid,
    title: 'API integration',
    startDate: '2026-11-02',
    dueDate: '2026-11-10',
    assigneeId: 'u-demo',
    plannedHours: 10,
  };
  assert.equal((await call('/api/tasks', 'POST', { ...fields, progress: 101 })).status, 400);
  assert.equal(
    (await call('/api/tasks', 'POST', { ...fields, dependencies: ['t-1'] })).status,
    400,
  );
  const first = await call('/api/tasks', 'POST', fields);
  assert.equal(first.status, 201);
  const second = await call('/api/tasks', 'POST', {
    ...fields,
    title: 'Dependent task',
    dependencies: [first.data.id],
  });
  assert.equal(second.status, 201);
  assert.equal(
    (await call('/api/tasks/' + first.data.id, 'PATCH', { dependencies: [second.data.id] })).status,
    400,
  );
  const done = await call('/api/tasks/' + first.data.id, 'PATCH', { status: 'done', progress: 12 });
  assert.equal(done.data.progress, 100);
  assert.equal(done.data.risk.score, 0);
  const comment = await call('/api/tasks/' + first.data.id + '/comments', 'POST', {
    text: 'Ready for review',
  });
  assert.equal(comment.status, 201);
  assert.equal(comment.data.authorName, 'Alex Morgan');
  const snapshot = await call('/api/snapshots', 'POST', { projectId: pid, name: 'Checkpoint' });
  assert.equal(snapshot.status, 201);
  assert.equal(snapshot.data.metrics.taskCount, 2);
  assert.equal(snapshot.data.metrics.completed, 1);
  const reloaded = await createStore({ dataDir, store: 'file', demo: true });
  assert.equal(
    reloaded.read().tasks.find((v) => v.id === first.data.id).comments[0].text,
    'Ready for review',
  );
  await reloaded.close();
  const member = await call('/api/members', 'POST', {
    name: 'Test member',
    email: 'member@orbit.local',
    password: 'MemberTest2026!',
    capacityHours: 40,
  });
  assert.equal(member.status, 201);
  assert.equal(
    (
      await call('/api/members', 'POST', {
        name: 'Bad admin',
        email: 'admin@orbit.local',
        role: 'admin',
      })
    ).status,
    403,
  );
  const memberLogin = await call('/api/auth/login', 'POST', {
    email: 'member@orbit.local',
    password: 'MemberTest2026!',
  });
  const mc = memberLogin.cookie.split(';')[0];
  assert.equal((await call('/api/bootstrap', 'GET', undefined, mc)).data.projects.length, 0);
  assert.equal(
    (await call('/api/tasks/' + first.data.id, 'PATCH', { progress: 10 }, mc)).status,
    404,
  );
  await call('/api/projects/' + pid, 'PATCH', { memberIds: ['u-demo', member.data.id] });
  await call('/api/tasks/' + second.data.id, 'PATCH', { assigneeId: member.data.id });
  assert.equal(
    (await call('/api/tasks/' + second.data.id, 'PATCH', { progress: 55 }, mc)).status,
    200,
  );
  assert.equal(
    (await call('/api/tasks/' + second.data.id, 'PATCH', { title: 'Forbidden' }, mc)).status,
    403,
  );
  assert.equal((await call('/api/tasks/' + first.data.id, 'DELETE', undefined, mc)).status, 403);
  assert.equal(
    (await call('/api/projects/' + pid, 'PATCH', { memberIds: ['u-demo'] })).status,
    400,
  );
  await call('/api/tasks/' + first.data.id, 'DELETE');
  assert.deepEqual(
    (await call('/api/tasks')).data.find((v) => v.id === second.data.id).dependencies,
    [],
  );
  await call('/api/projects/' + pid, 'DELETE');
  const final = await call('/api/bootstrap');
  assert.equal(
    final.data.tasks.some((v) => v.projectId === pid),
    false,
  );
  assert.equal(
    final.data.snapshots.some((v) => v.projectId === pid),
    false,
  );
  assert.equal(
    final.data.events.some((v) => v.projectId === pid),
    false,
  );
  await call('/api/auth/logout', 'POST');
  assert.equal((await call('/api/auth/me')).status, 401);
});

test('explicit Mongo mode never silently falls back to a file store', async () => {
  await assert.rejects(createStore({ store: 'mongo', mongoUri: '' }), /MONGODB_URI/);
});
