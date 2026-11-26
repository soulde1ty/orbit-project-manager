import test from 'node:test';
import assert from 'node:assert/strict';
import { editorPayload, csvCell } from '../src/forms.js';
import { weightedProgress, expectedProgress, analytics } from '../shared/metrics.js';
import { strings } from '../src/i18n.js';
import { translate } from '../src/i18n.js';
import { nextStep, deadlineOffset, deadlineLabel } from '../src/lib/daily-focus.js';

test('the next step explains blockers and respects the member assignment scope', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  const tasks = [
    { id: 'mine', assigneeId: 'me', status: 'todo', dueDate: '2026-11-26', dependencies: [] },
    {
      id: 'blocked',
      assigneeId: 'other',
      status: 'blocked',
      dueDate: '2026-11-28',
      dependencies: [],
    },
    { id: 'finished', assigneeId: 'me', status: 'done', dueDate: '2026-11-20', dependencies: [] },
  ];
  assert.equal(nextStep(tasks, 'me', false, now).task.id, 'mine');
  assert.equal(nextStep(tasks, 'me', false, now).key, 'focusToday');
  assert.equal(nextStep(tasks, 'me', true, now).task.id, 'blocked');
  assert.equal(nextStep(tasks, 'me', true, now).key, 'focusBlocked');
  assert.equal(nextStep(tasks, 'nobody', false, now), null);
  const dependent = { ...tasks[0], dependencies: ['blocked'] };
  assert.equal(nextStep([dependent, tasks[1]], 'me', false, now).key, 'focusBlocked');
  assert.equal(
    nextStep([{ ...dependent, dependencies: ['finished'] }, tasks[2]], 'me', false, now).key,
    'focusToday',
  );
  assert.equal(deadlineOffset(tasks[0], new Date('2026-11-26T23:59:59Z')), 0);
  assert.equal(
    deadlineLabel(
      tasks[0],
      (key, values) => translate('ru', key, values),
      new Date('2026-11-27T00:00:00Z'),
    ),
    'Просрочено на 1 день',
  );
});

test('personal copy handles Russian plurals and literal user names', () => {
  assert.equal(translate('ru', 'projectCount', { count: 1 }), '1 проект');
  assert.equal(translate('ru', 'projectCount', { count: 2 }), '2 проекта');
  assert.equal(translate('ru', 'projectCount', { count: 11 }), '11 проектов');
  assert.equal(translate('ru', 'projectCount', { count: 21 }), '21 проект');
  assert.equal(translate('en', 'taskCountValue', { count: 1 }), '1 task');
  assert.equal(translate('en', 'taskCountValue', { count: 0 }), '0 tasks');
  assert.equal(translate('en', 'greetingNamed', { name: '$&' }), 'Hi, $&.');
});

test('task edit form strips immutable metadata and only sends member-permitted changes', () => {
  const form = {
    id: 't',
    projectId: 'p',
    title: ' Task ',
    progress: 40,
    status: 'in_progress',
    actualHours: 3,
    subtasks: [],
    risk: { score: 0.5 },
    comments: [],
  };
  const edit = editorPayload('task', form, { editing: true, manager: true });
  assert.equal(edit.title, 'Task');
  for (const key of ['id', 'projectId', 'risk', 'comments']) assert.equal(key in edit, false);
  assert.equal(editorPayload('task', form, { manager: true }).projectId, 'p');
  assert.deepEqual(Object.keys(editorPayload('task', form, { editing: true })), [
    'status',
    'actualHours',
    'progress',
    'subtasks',
  ]);
});
test('live progress and snapshots use identical weighting and inclusive due dates', () => {
  const now = new Date('2026-11-03T12:00:00Z');
  const common = {
    projectId: 'p',
    startDate: '2026-11-03',
    dueDate: '2026-11-03',
    status: 'todo',
    actualHours: 0,
    dependencies: [],
    updatedAt: now.toISOString(),
  };
  const tasks = [
    { ...common, id: 'a', plannedHours: 1, progress: 100 },
    { ...common, id: 'b', plannedHours: 3, progress: 0 },
  ];
  assert.equal(expectedProgress(tasks[0], now), 50);
  assert.equal(weightedProgress(tasks), 25);
  const metrics = analytics('p', { tasks, members: [] }, now);
  assert.equal(metrics.progress, 25);
  assert.equal(metrics.plannedProgress, 50);
  assert.equal(metrics.overdueCount, 0);
  assert.equal(
    analytics('p', { tasks, members: [] }, new Date('2026-11-04T00:00:00Z')).overdueCount,
    2,
  );
});
test('Russian and English translations have matching keys and CSV export escapes formulas', () => {
  assert.deepEqual(Object.keys(strings.ru).sort(), Object.keys(strings.en).sort());
  assert.equal(csvCell('  =HYPERLINK("x")'), '"\'  =HYPERLINK(""x"")"');
  assert.equal(csvCell('Hello, world'), '"Hello, world"');
  assert.equal(csvCell('Обычная задача'), '"Обычная задача"');
});
