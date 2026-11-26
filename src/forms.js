// The API accepts mutable fields only. In particular, tasks cannot change projects.
export function editorPayload(kind, form, { editing = false, manager = false } = {}) {
  const keys =
    kind === 'project'
      ? ['name', 'description', 'startDate', 'dueDate', 'status', 'color', 'memberIds']
      : kind === 'member'
        ? ['name', 'email', 'role', 'capacityHours', 'color']
        : manager
          ? [
              'title',
              'description',
              ...(!editing ? ['projectId'] : []),
              'status',
              'priority',
              'assigneeId',
              'startDate',
              'dueDate',
              'plannedHours',
              'actualHours',
              'progress',
              'dependencies',
              'subtasks',
            ]
          : ['status', 'actualHours', 'progress', 'subtasks'];
  const body = Object.fromEntries(
    keys.map((key) => [key, typeof form[key] === 'string' ? form[key].trim() : form[key]]),
  );
  if (kind === 'task' && form.status === 'done') body.progress = 100;
  if (kind === 'member' && form.password) body.password = form.password;
  return body;
}

export function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
