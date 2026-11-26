const DAY = 86_400_000;
export const clamp = (n, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0));
export function expectedProgress(task, now = new Date()) {
  const start = Date.parse(task.startDate),
    end = Date.parse(task.dueDate) + DAY;
  if (end <= start) return now.getTime() >= end ? 100 : 0;
  return Math.round(clamp((now.getTime() - start) / (end - start)) * 100);
}
export function workloadFor(member, tasks, now = new Date()) {
  const horizon = now.getTime() + 7 * DAY;
  const hours = tasks
    .filter(
      (t) =>
        t.assigneeId === member.id && t.status !== 'done' && Date.parse(t.startDate) <= horizon,
    )
    .reduce((n, t) => n + t.plannedHours * (1 - t.progress / 100), 0);
  return {
    memberId: member.id,
    hours: Math.round(hours * 10) / 10,
    capacity: member.capacityHours,
    ratio: member.capacityHours > 0 ? hours / member.capacityHours : hours > 0 ? 2 : 0,
  };
}
export function calculateRisk(task, tasks, members, now = new Date()) {
  const components = { deadline: 0, progress: 0, workload: 0, blocked: 0, inactivity: 0 };
  if (task.status === 'done') return { score: 0, level: 'low', components };
  const remainingDays = (Date.parse(task.dueDate) + DAY - now.getTime()) / DAY;
  components.deadline = remainingDays <= 0 ? 1 : clamp(1 - remainingDays / 7);
  components.progress = clamp((expectedProgress(task, now) - task.progress) / 100);
  const member = members.find((m) => m.id === task.assigneeId);
  components.workload = member ? clamp(workloadFor(member, tasks, now).ratio - 1) : 0;
  components.blocked =
    task.status === 'blocked' ||
    task.dependencies.some((id) => tasks.find((t) => t.id === id)?.status !== 'done')
      ? 1
      : 0;
  components.inactivity = clamp((now.getTime() - Date.parse(task.updatedAt)) / (7 * DAY));
  const score =
    Math.round(
      (components.deadline * 0.3 +
        components.progress * 0.25 +
        components.workload * 0.2 +
        components.blocked * 0.15 +
        components.inactivity * 0.1) *
        1000,
    ) / 1000;
  return { score, level: score >= 0.65 ? 'high' : score >= 0.35 ? 'medium' : 'low', components };
}
export function weightedProgress(tasks, now) {
  const total = tasks.reduce((sum, t) => sum + t.plannedHours, 0);
  if (!tasks.length) return 0;
  return Math.round(
    tasks.reduce(
      (sum, t) =>
        sum + (now ? expectedProgress(t, now) : t.progress) * (total ? t.plannedHours : 1),
      0,
    ) / (total || tasks.length),
  );
}
export function analytics(projectId, state, now = new Date()) {
  const tasks = state.tasks.filter((t) => t.projectId === projectId);
  const scores = tasks.map((t) => calculateRisk(t, state.tasks, state.members, now));
  return {
    taskCount: tasks.length,
    completed: tasks.filter((t) => t.status === 'done').length,
    progress: weightedProgress(tasks),
    plannedProgress: weightedProgress(tasks, now),
    riskCount: scores.filter((r) => r.level === 'high').length,
    averageRisk: tasks.length
      ? Math.round((scores.reduce((sum, risk) => sum + risk.score, 0) / tasks.length) * 1000) / 1000
      : 0,
    overdueCount: tasks.filter(
      (t) => t.status !== 'done' && Date.parse(t.dueDate) + DAY <= now.getTime(),
    ).length,
    plannedHours: tasks.reduce((n, t) => n + t.plannedHours, 0),
    actualHours: tasks.reduce((n, t) => n + t.actualHours, 0),
  };
}
