export const today = () => new Date().toISOString().slice(0, 10);

export const initials = (name = '?') =>
  name
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const number = (value) => Number(value) || 0;

export const bounded = (value) => Math.max(0, Math.min(100, number(value)));

export const riskScore = (task) => Math.round(number(task.risk?.score) * 100);

export const isHighRisk = (task) => task.status !== 'done' && task.risk?.level === 'high';

export const formatDate = (value, locale, options = { day: 'numeric', month: 'short' }) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleDateString(locale, {
        ...options,
        ...(/^\d{4}-\d{2}-\d{2}$/.test(value) ? { timeZone: 'UTC' } : {}),
      })
    : '…';

export const dueInfo = (task) =>
  !task.dueDate || task.status === 'done'
    ? false
    : Date.parse(task.dueDate) + 86400000 < Date.now();
