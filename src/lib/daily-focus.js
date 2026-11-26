const DAY = 86_400_000;

export function deadlineOffset(task, now = new Date()) {
  if (!task.dueDate) return null;
  return Math.floor(Date.parse(task.dueDate) / DAY) - Math.floor(now.getTime() / DAY);
}

export function nextStep(tasks, userId, canManage, now = new Date()) {
  const openTasks = tasks.filter(
    (task) => task.status !== 'done' && (canManage || task.assigneeId === userId),
  );
  function reason(task) {
    const waiting = task.dependencies?.some(
      (id) => tasks.find((other) => other.id === id)?.status !== 'done',
    );
    if (task.status === 'blocked' || waiting) return { rank: 0, key: 'focusBlocked' };
    const offset = deadlineOffset(task, now);
    if (offset !== null && offset < 0) return { rank: 1, key: 'focusOverdue' };
    if (task.status === 'review') return { rank: 2, key: 'focusReview' };
    if (offset === 0) return { rank: 3, key: 'focusToday' };
    if (task.risk?.level === 'high') return { rank: 4, key: 'focusHighRisk' };
    return { rank: 5, key: 'focusUpcoming' };
  }
  // A blocker is worth discussing before starting more work. Dates break ties.
  return (
    openTasks
      .map((task) => ({ task, ...reason(task) }))
      .sort((a, b) => a.rank - b.rank || a.task.dueDate.localeCompare(b.task.dueDate))[0] || null
  );
}

export function deadlineLabel(task, t, now = new Date()) {
  const offset = deadlineOffset(task, now);
  if (offset === null) return t('noDue');
  if (task.status !== 'done') {
    if (offset < 0) return t('overdueDays', { count: -offset });
    if (offset === 0) return t('dueToday');
    if (offset === 1) return t('dueTomorrow');
  }
  return new Date(task.dueDate).toLocaleDateString(t('dateLocale'), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
