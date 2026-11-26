import { randomBytes, scryptSync } from 'node:crypto';
import { analytics, calculateRisk } from './risk.js';
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function createSeed({ demo = true, adminEmail, adminPassword } = {}) {
  const now = new Date();
  const day = (n) => new Date(now.getTime() + n * 86400000).toISOString().slice(0, 10);
  const stamp = (n) => new Date(now.getTime() + n * 86400000).toISOString();
  const members = [
    {
      id: 'u-demo',
      name: 'Alex Morgan',
      email: adminEmail || 'demo@orbit.local',
      role: demo ? 'manager' : 'admin',
      capacityHours: 40,
      color: '#c8f36b',
      passwordHash: hashPassword(
        adminPassword || (demo ? 'OrbitDemo2026!' : randomBytes(32).toString('hex')),
      ),
    },
    ...(!demo
      ? []
      : [
          {
            id: 'u-anna',
            name: 'Anna Volkova',
            email: 'anna@orbit.local',
            role: 'member',
            capacityHours: 32,
            color: '#c4b5fd',
          },
          {
            id: 'u-max',
            name: 'Max Chen',
            email: 'max@orbit.local',
            role: 'member',
            capacityHours: 40,
            color: '#93c5fd',
          },
          {
            id: 'u-sofia',
            name: 'Sofia Torres',
            email: 'sofia@orbit.local',
            role: 'member',
            capacityHours: 36,
            color: '#fda4af',
          },
          {
            id: 'u-daniel',
            name: 'Daniel Kim',
            email: 'daniel@orbit.local',
            role: 'member',
            capacityHours: 40,
            color: '#fdba74',
          },
        ]),
  ];
  const state = { members, projects: [], tasks: [], events: [], snapshots: [] };
  if (!demo) return state;
  state.projects = [
    {
      id: 'p-platform',
      name: 'Orbit Platform',
      description:
        'A calmer workspace for ambitious teams. Build the next generation of project intelligence.',
      color: '#c8f36b',
      status: 'active',
      startDate: day(-21),
      dueDate: day(21),
      memberIds: members.map((m) => m.id),
      createdAt: stamp(-21),
    },
    {
      id: 'p-brand',
      name: 'Brand & Experience',
      description:
        'A thoughtful visual identity and a consistent experience across every touchpoint.',
      color: '#c4b5fd',
      status: 'active',
      startDate: day(-14),
      dueDate: day(14),
      memberIds: ['u-demo', 'u-anna', 'u-sofia'],
      createdAt: stamp(-14),
    },
    {
      id: 'p-mobile',
      name: 'Mobile Companion',
      description: 'Keep your projects moving, wherever the day takes you.',
      color: '#93c5fd',
      status: 'active',
      startDate: day(-7),
      dueDate: day(35),
      memberIds: ['u-demo', 'u-max', 'u-daniel'],
      createdAt: stamp(-7),
    },
  ];
  const specs = [
    [
      'p-platform',
      'Discovery & product requirements',
      'done',
      'high',
      'u-demo',
      100,
      16,
      18,
      -21,
      -14,
    ],
    [
      'p-platform',
      'Design the dashboard experience',
      'done',
      'high',
      'u-anna',
      100,
      24,
      22,
      -18,
      -7,
    ],
    [
      'p-platform',
      'Build project management API',
      'in_progress',
      'high',
      'u-max',
      65,
      40,
      27,
      -12,
      4,
    ],
    [
      'p-platform',
      'Connect the analytics pipeline',
      'blocked',
      'urgent',
      'u-max',
      20,
      32,
      14,
      -14,
      -2,
    ],
    [
      'p-platform',
      'Implement task board interactions',
      'in_progress',
      'high',
      'u-sofia',
      55,
      28,
      18,
      -7,
      5,
    ],
    [
      'p-platform',
      'Review authentication and permissions',
      'review',
      'high',
      'u-daniel',
      90,
      20,
      19,
      -10,
      2,
    ],
    ['p-platform', 'Create onboarding illustrations', 'todo', 'medium', 'u-anna', 0, 12, 0, 2, 10],
    [
      'p-platform',
      'Validate RiskScore calculations',
      'in_progress',
      'urgent',
      'u-daniel',
      30,
      24,
      16,
      -10,
      -1,
    ],
    ['p-platform', 'Write release documentation', 'todo', 'low', 'u-demo', 0, 8, 0, 10, 18],
    ['p-platform', 'Run accessibility audit', 'todo', 'medium', 'u-sofia', 0, 16, 0, 7, 14],
    ['p-brand', 'Define the visual direction', 'done', 'high', 'u-anna', 100, 16, 14, -14, -7],
    [
      'p-brand',
      'Build a reusable component library',
      'in_progress',
      'high',
      'u-anna',
      70,
      32,
      25,
      -10,
      5,
    ],
    ['p-brand', 'Prepare landing page copy', 'review', 'medium', 'u-sofia', 90, 12, 10, -7, 3],
    ['p-brand', 'Publish the brand guidelines', 'todo', 'low', 'u-demo', 0, 8, 0, 5, 14],
    ['p-mobile', 'Map core mobile journeys', 'done', 'high', 'u-demo', 100, 12, 11, -7, -2],
    ['p-mobile', 'Set up the application shell', 'in_progress', 'high', 'u-max', 40, 24, 10, -4, 7],
    [
      'p-mobile',
      'Implement offline synchronization',
      'todo',
      'medium',
      'u-daniel',
      0,
      40,
      0,
      7,
      21,
    ],
    ['p-mobile', 'Test push notification delivery', 'todo', 'medium', 'u-daniel', 0, 16, 0, 14, 28],
  ];
  state.tasks = specs.map((s, i) => ({
    id: `t-${i + 1}`,
    projectId: s[0],
    title: s[1],
    description:
      'Coordinate with the team, document decisions, and verify the acceptance criteria before moving to done.',
    status: s[2],
    priority: s[3],
    assigneeId: s[4],
    progress: s[5],
    plannedHours: s[6],
    actualHours: s[7],
    startDate: day(s[8]),
    dueDate: day(s[9]),
    dependencies: i === 3 ? ['t-3'] : i === 8 ? ['t-6'] : [],
    subtasks: [
      { id: `st-${i}-1`, title: 'Define acceptance criteria', done: s[5] > 0 },
      { id: `st-${i}-2`, title: 'Review with the team', done: s[5] === 100 },
    ],
    createdAt: stamp(s[8]),
    updatedAt: stamp(i === 3 || i === 7 ? -8 : i % 3 === 0 ? -2 : 0),
  }));
  state.events = state.tasks
    .slice(0, 10)
    .reverse()
    .map((task, i) => ({
      id: `e-${i}`,
      projectId: task.projectId,
      taskId: task.id,
      type: task.status === 'done' ? 'task.completed' : 'task.updated',
      actorName: members.find((m) => m.id === task.assigneeId).name,
      createdAt: stamp(-i / 10),
      details: task.title,
    }));
  // Seed snapshots use the same data model and risk engine as snapshots created by the user.
  for (const project of state.projects) {
    state.snapshots.push({
      id: `s-${project.id}`,
      projectId: project.id,
      name: 'Initial baseline',
      createdAt: now.toISOString(),
      metrics: analytics(project.id, state, now),
      tasks: state.tasks
        .filter((t) => t.projectId === project.id)
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          progress: t.progress,
          riskScore: calculateRisk(t, state.tasks, members, now).score,
        })),
    });
  }
  return state;
}
