import express from 'express';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { analytics, calculateRisk, workloadFor } from './risk.js';
import { hashPassword } from './seed.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Invalid date');
const title = z.string().trim().min(1).max(180);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const taskSchema = z
  .object({
    projectId: id,
    title,
    description: z.string().max(10000).default(''),
    status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']).default('todo'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    assigneeId: z.union([id, z.literal('')]).default(''),
    startDate: date,
    dueDate: date,
    plannedHours: z.number().min(0).max(100000).default(8),
    actualHours: z.number().min(0).max(100000).default(0),
    progress: z.number().min(0).max(100).default(0),
    dependencies: z.array(id).max(100).default([]),
    subtasks: z
      .array(z.object({ id, title, done: z.boolean() }).strict())
      .max(100)
      .default([]),
  })
  .strict();
const projectSchema = z
  .object({
    name: title,
    description: z.string().max(10000).default(''),
    color: color.default('#c8f36b'),
    status: z.enum(['active', 'completed', 'paused', 'archived']).default('active'),
    startDate: date,
    dueDate: date,
    memberIds: z.array(id).min(1).max(100).default([]),
  })
  .strict();
const memberSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(200),
    capacityHours: z.number().min(1).max(168).default(40),
    color: color.default('#93c5fd'),
    role: z.enum(['member', 'manager', 'admin']).default('member'),
    password: z.string().min(12).max(128).optional(),
  })
  .strict();
const safeUser = ({ passwordHash, ...user }) => user;
const fail = (status, code) => {
  const e = new Error(code);
  e.status = status;
  throw e;
};
const canAccess = (user, project) =>
  project && (user.role === 'admin' || project.memberIds.includes(user.id));
const manager = (user) => user.role === 'admin' || user.role === 'manager';
const needManager = (user) => {
  if (!manager(user)) fail(403, 'forbidden');
};
function projectFor(state, user, projectId) {
  const p = state.projects.find((p) => p.id === projectId);
  if (!p || !canAccess(user, p)) fail(404, 'project_not_found');
  return p;
}
function taskFor(state, user, taskId) {
  const t = state.tasks.find((t) => t.id === taskId);
  if (!t) fail(404, 'task_not_found');
  projectFor(state, user, t.projectId);
  return t;
}
const ensureDates = (value) => {
  if (value.startDate > value.dueDate) fail(400, 'invalid_date_range');
};
function validateTask(task, state, project) {
  ensureDates(task);
  if (task.assigneeId && !project.memberIds.includes(task.assigneeId))
    fail(400, 'assignee_not_in_project');
  if (new Set(task.dependencies).size !== task.dependencies.length)
    fail(400, 'duplicate_dependency');
  if (new Set(task.subtasks.map((s) => s.id)).size !== task.subtasks.length)
    fail(400, 'duplicate_subtask');
  for (const dependency of task.dependencies) {
    const other = state.tasks.find((t) => t.id === dependency);
    if (!other || other.projectId !== task.projectId || other.id === task.id)
      fail(400, 'invalid_dependency');
    const seen = new Set();
    function visits(current) {
      if (current === task.id) return true;
      if (seen.has(current)) return false;
      seen.add(current);
      return (state.tasks.find((t) => t.id === current)?.dependencies || []).some(visits);
    }
    if (visits(dependency)) fail(400, 'dependency_cycle');
  }
  if (task.status === 'done') task.progress = 100;
}
function event(state, user, projectId, type, details, taskId = null) {
  state.events.unshift({
    id: randomUUID(),
    projectId,
    taskId,
    type,
    details,
    actorName: user.name,
    createdAt: new Date().toISOString(),
  });
}
const decorate = (task, state) => ({
  ...task,
  risk: calculateRisk(task, state.tasks, state.members),
});

export function createApp(store, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  const sessions = new Map(),
    attempts = new Map();
  const secure = options.secureCookie ?? process.env.COOKIE_SECURE === 'true';
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000'
  )
    .split(',')
    .map((v) => v.trim());
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
    );
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Origin')) {
      let origin;
      try {
        origin = new URL(req.get('Origin'));
      } catch {
        return res.status(403).json({ error: 'origin_not_allowed' });
      }
      if (origin.host !== req.get('Host') && !allowedOrigins.includes(origin.origin))
        return res.status(403).json({ error: 'origin_not_allowed' });
    }
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
  const cookie = (req) => {
    const raw = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('orbit_session='));
    return raw ? raw.slice('orbit_session='.length) : '';
  };
  const requireAuth = (req, res, next) => {
    const hash = tokenHash(cookie(req)),
      session = sessions.get(hash);
    if (!session || session.expires < Date.now()) {
      sessions.delete(hash);
      return res.status(401).json({ error: 'unauthorized' });
    }
    const user = store.read().members.find((m) => m.id === session.userId);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = safeUser(user);
    next();
  };
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  };
  app.get('/api/health', (req, res) => res.json({ status: 'ok', storageMode: store.mode }));
  app.get('/api/config', (req, res) => res.json({ demoMode: store.demo }));
  app.post('/api/auth/login', (req, res) => {
    const parsed = z
      .object({ email: z.string().max(200), password: z.string().max(128) })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    const now = Date.now(),
      key = req.ip;
    for (const [ip, item] of attempts) if (now - item.start > 15 * 60 * 1000) attempts.delete(ip);
    const attempt = attempts.get(key) || { count: 0, start: now };
    if (attempt.count >= 12) return res.status(429).json({ error: 'too_many_attempts' });
    attempt.count++;
    attempts.set(key, attempt);
    const user = store
      .read()
      .members.find((m) => m.email.toLowerCase() === parsed.data.email.trim().toLowerCase());
    const [salt, hash] = (user?.passwordHash || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const actual = scryptSync(parsed.data.password, salt, 64),
      expected = Buffer.from(hash, 'hex');
    if (
      !user?.passwordHash ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      return res.status(401).json({ error: 'invalid_credentials' });
    attempts.delete(key);
    for (const [hash, s] of sessions) if (s.expires < now) sessions.delete(hash);
    const token = randomBytes(32).toString('hex');
    sessions.set(tokenHash(token), { userId: user.id, expires: now + cookieOptions.maxAge });
    res.cookie('orbit_session', token, cookieOptions).json({ user: safeUser(user) });
  });
  app.post('/api/auth/logout', (req, res) => {
    sessions.delete(tokenHash(cookie(req)));
    res
      .clearCookie('orbit_session', { httpOnly: true, sameSite: 'strict', secure, path: '/' })
      .json({ ok: true });
  });
  app.use('/api', requireAuth);
  app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));
  app.get('/api/bootstrap', (req, res) => {
    const state = store.read(),
      projects = state.projects.filter((p) => canAccess(req.user, p)),
      projectIds = new Set(projects.map((p) => p.id));
    const memberIds = new Set(projects.flatMap((p) => p.memberIds));
    memberIds.add(req.user.id);
    res.json({
      user: req.user,
      projects,
      tasks: state.tasks.filter((t) => projectIds.has(t.projectId)).map((t) => decorate(t, state)),
      members: state.members.filter((m) => manager(req.user) || memberIds.has(m.id)).map(safeUser),
      events: state.events.filter((e) => projectIds.has(e.projectId)),
      snapshots: state.snapshots.filter((s) => projectIds.has(s.projectId)),
      storageMode: store.mode,
    });
  });
  app.get('/api/projects', (req, res) =>
    res.json(store.read().projects.filter((p) => canAccess(req.user, p))),
  );
  app.post('/api/projects', async (req, res) => {
    needManager(req.user);
    // Membership defaults to the creator for a newly created project.
    const input = {
      ...req.body,
      memberIds: req.body?.memberIds?.length ? req.body.memberIds : [req.user.id],
    };
    const parsed = projectSchema.parse(input);
    ensureDates(parsed);
    const project = await store.mutate((state) => {
      if (!parsed.memberIds.includes(req.user.id)) parsed.memberIds.push(req.user.id);
      if (parsed.memberIds.some((id) => !state.members.some((m) => m.id === id)))
        fail(400, 'member_not_found');
      const project = { ...parsed, id: randomUUID(), createdAt: new Date().toISOString() };
      state.projects.push(project);
      event(state, req.user, project.id, 'project.created', project.name);
      return project;
    });
    res.status(201).json(project);
  });
  app.patch('/api/projects/:id', async (req, res) => {
    needManager(req.user);
    id.parse(req.params.id);
    const patch = projectSchema.partial().parse(req.body);
    const project = await store.mutate((state) => {
      const project = projectFor(state, req.user, req.params.id),
        merged = { ...project, ...patch };
      ensureDates(merged);
      if (merged.memberIds.some((id) => !state.members.some((m) => m.id === id)))
        fail(400, 'member_not_found');
      if (!merged.memberIds.includes(req.user.id) && req.user.role !== 'admin')
        fail(400, 'cannot_remove_self');
      if (
        state.tasks.some(
          (t) =>
            t.projectId === project.id && t.assigneeId && !merged.memberIds.includes(t.assigneeId),
        )
      )
        fail(400, 'member_has_assigned_tasks');
      Object.assign(project, merged);
      event(state, req.user, project.id, 'project.updated', project.name);
      return project;
    });
    res.json(project);
  });
  app.delete('/api/projects/:id', async (req, res) => {
    needManager(req.user);
    id.parse(req.params.id);
    await store.mutate((state) => {
      const project = projectFor(state, req.user, req.params.id);
      state.projects = state.projects.filter((p) => p.id !== project.id);
      for (const key of ['tasks', 'events', 'snapshots'])
        state[key] = state[key].filter((v) => v.projectId !== project.id);
    });
    res.json({ ok: true });
  });
  app.get('/api/tasks', (req, res) => {
    const state = store.read();
    res.json(
      state.tasks
        .filter(
          (t) =>
            (!req.query.projectId || t.projectId === req.query.projectId) &&
            canAccess(
              req.user,
              state.projects.find((p) => p.id === t.projectId),
            ),
        )
        .map((t) => decorate(t, state)),
    );
  });
  app.post('/api/tasks', async (req, res) => {
    needManager(req.user);
    const parsed = taskSchema.parse(req.body);
    const task = await store.mutate((state) => {
      const project = projectFor(state, req.user, parsed.projectId),
        now = new Date().toISOString();
      const task = { ...parsed, id: randomUUID(), createdAt: now, updatedAt: now };
      validateTask(task, state, project);
      state.tasks.push(task);
      event(state, req.user, project.id, 'task.created', task.title, task.id);
      return decorate(task, state);
    });
    res.status(201).json(task);
  });
  app.patch('/api/tasks/:id', async (req, res) => {
    id.parse(req.params.id);
    const patch = taskSchema.omit({ projectId: true }).partial().parse(req.body);
    const task = await store.mutate((state) => {
      const task = taskFor(state, req.user, req.params.id),
        previousRisk = calculateRisk(task, state.tasks, state.members);
      if (
        !manager(req.user) &&
        (task.assigneeId !== req.user.id ||
          Object.keys(patch).some(
            (k) => !['status', 'progress', 'actualHours', 'subtasks'].includes(k),
          ))
      )
        fail(403, 'forbidden');
      const merged = { ...task, ...patch, updatedAt: new Date().toISOString() };
      validateTask(merged, state, projectFor(state, req.user, task.projectId));
      Object.assign(task, merged);
      const enriched = decorate(task, state);
      event(
        state,
        req.user,
        task.projectId,
        task.status === 'done' ? 'task.completed' : 'task.updated',
        task.title,
        task.id,
      );
      if (enriched.risk.level === 'high' && previousRisk.level !== 'high')
        event(state, req.user, task.projectId, 'risk.high', task.title, task.id);
      return enriched;
    });
    res.json(task);
  });
  app.delete('/api/tasks/:id', async (req, res) => {
    needManager(req.user);
    id.parse(req.params.id);
    await store.mutate((state) => {
      const task = taskFor(state, req.user, req.params.id);
      state.tasks = state.tasks.filter((t) => t.id !== task.id);
      for (const t of state.tasks) t.dependencies = t.dependencies.filter((v) => v !== task.id);
      event(state, req.user, task.projectId, 'task.deleted', task.title, task.id);
    });
    res.json({ ok: true });
  });
  app.post('/api/tasks/:id/comments', async (req, res) => {
    id.parse(req.params.id);
    const { text } = z
      .object({ text: z.string().trim().min(1).max(4000) })
      .strict()
      .parse(req.body);
    const comment = await store.mutate((state) => {
      const task = taskFor(state, req.user, req.params.id);
      const comment = {
        id: randomUUID(),
        text,
        authorName: req.user.name,
        authorId: req.user.id,
        createdAt: new Date().toISOString(),
      };
      task.comments ||= [];
      if (task.comments.length >= 500) fail(400, 'comment_limit_reached');
      task.comments.push(comment);
      task.updatedAt = comment.createdAt;
      event(state, req.user, task.projectId, 'comment.created', task.title, task.id);
      return comment;
    });
    res.status(201).json(comment);
  });
  app.post('/api/snapshots', async (req, res) => {
    needManager(req.user);
    const input = z.object({ projectId: id, name: title }).strict().parse(req.body);
    const snapshot = await store.mutate((state) => {
      projectFor(state, req.user, input.projectId);
      const snapshot = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        metrics: analytics(input.projectId, state),
        tasks: state.tasks
          .filter((t) => t.projectId === input.projectId)
          .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            progress: t.progress,
            riskScore: calculateRisk(t, state.tasks, state.members).score,
          })),
      };
      state.snapshots.unshift(snapshot);
      event(state, req.user, input.projectId, 'snapshot.created', input.name);
      return snapshot;
    });
    res.status(201).json(snapshot);
  });
  app.delete('/api/snapshots/:id', async (req, res) => {
    needManager(req.user);
    id.parse(req.params.id);
    await store.mutate((state) => {
      const snapshot = state.snapshots.find((s) => s.id === req.params.id);
      if (!snapshot) fail(404, 'snapshot_not_found');
      projectFor(state, req.user, snapshot.projectId);
      state.snapshots = state.snapshots.filter((s) => s.id !== snapshot.id);
      event(state, req.user, snapshot.projectId, 'snapshot.deleted', snapshot.name);
    });
    res.json({ ok: true });
  });
  app.get('/api/analytics/:projectId', async (req, res) => {
    const state = store.read(),
      project = projectFor(state, req.user, req.params.projectId);
    const aggregate = await store.aggregateProject?.(project.id);
    res.json({
      ...analytics(project.id, state),
      ...aggregate,
      workload: state.members
        .filter((m) => project.memberIds.includes(m.id))
        .map((m) => workloadFor(m, state.tasks)),
    });
  });
  app.post('/api/members', async (req, res) => {
    needManager(req.user);
    const input = memberSchema.parse(req.body);
    if (req.user.role !== 'admin' && input.role !== 'member') fail(403, 'forbidden');
    const user = await store.mutate((state) => {
      if (state.members.some((m) => m.email.toLowerCase() === input.email))
        fail(409, 'email_exists');
      const { password, ...profile } = input;
      const user = {
        ...profile,
        id: randomUUID(),
        ...(password ? { passwordHash: hashPassword(password) } : {}),
      };
      state.members.push(user);
      return safeUser(user);
    });
    res.status(201).json(user);
  });
  app.patch('/api/members/:id', async (req, res) => {
    needManager(req.user);
    id.parse(req.params.id);
    const input = memberSchema.partial().parse(req.body);
    const user = await store.mutate((state) => {
      const user = state.members.find((m) => m.id === req.params.id);
      if (!user) fail(404, 'member_not_found');
      if (
        req.user.role !== 'admin' &&
        ((user.role !== 'member' && user.id !== req.user.id) ||
          (input.role && input.role !== user.role) ||
          (input.password && user.id !== req.user.id))
      )
        fail(403, 'forbidden');
      if (user.id === req.user.id && input.role && input.role !== user.role)
        fail(400, 'cannot_change_own_role');
      if (
        input.email &&
        state.members.some((m) => m.id !== user.id && m.email.toLowerCase() === input.email)
      )
        fail(409, 'email_exists');
      const { password, ...profile } = input;
      Object.assign(user, profile);
      if (password) {
        user.passwordHash = hashPassword(password);
        for (const [token, s] of sessions) if (s.userId === user.id) sessions.delete(token);
      }
      return safeUser(user);
    });
    res.json(user);
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
  const dist = options.distDir || path.resolve('dist');
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.use((req, res, next) =>
      req.method === 'GET' && req.accepts('html')
        ? res.sendFile(path.join(dist, 'index.html'))
        : next(),
    );
  }
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: 'invalid_input',
        fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'invalid_json' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'payload_too_large' });
    if (!error.status) console.error('API error:', error.message);
    res
      .status(error.status || 500)
      .json({ error: error.status ? error.message : 'internal_error' });
  });
  return app;
}
