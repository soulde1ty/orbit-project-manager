import { useState } from 'react';
import { Check, Plus, X, AlertCircle, Trash2, Send } from 'lucide-react';
import { strings } from '../i18n.js';
import { editorPayload } from '../forms.js';
import { today, number, formatDate, riskScore } from '../lib/format.js';
import { statuses, priorities, colors } from '../lib/constants.js';
import { Modal, Field, Avatar, Badge, Progress } from './ui.jsx';

export function Editor({ modal, data, user, manager, t, close, mutate, setModal }) {
  const item = modal.item;
  const kind = modal.kind;
  const [form, setForm] = useState(() =>
    kind === 'project'
      ? {
          name: '',
          description: '',
          startDate: today(),
          dueDate: '',
          status: 'active',
          color: colors[0],
          memberIds: data.members.map((m) => m.id),
          ...item,
        }
      : kind === 'member'
        ? { name: '', email: '', role: 'member', capacityHours: 40, color: colors[0], ...item }
        : kind === 'snapshot'
          ? {
              name: `${t('snapshotDefault')} · ${today()}`,
              projectId: modal.projectId || data.projects[0]?.id,
            }
          : {
              title: '',
              description: '',
              projectId: modal.projectId || data.projects[0]?.id,
              status: modal.status || 'todo',
              priority: 'medium',
              assigneeId: '',
              startDate: today(),
              dueDate: '',
              plannedHours: 8,
              actualHours: 0,
              progress: 0,
              dependencies: [],
              subtasks: [],
              ...item,
            },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [newSubtask, setNewSubtask] = useState(''),
    [comment, setComment] = useState(''),
    [comments, setComments] = useState(item?.comments || []);
  const canEditTask = manager || item?.assigneeId === user?.id;
  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const title =
    kind === 'delete'
      ? t('confirmDelete')
      : kind === 'snapshot'
        ? t('newSnapshot')
        : t(`${item ? 'update' : 'new'}${kind[0].toUpperCase()}${kind.slice(1)}`);
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (
      ['project', 'task'].includes(kind) &&
      form.startDate &&
      form.dueDate &&
      form.startDate > form.dueDate
    ) {
      setError(t('invalidDates'));
      return;
    }
    setBusy(true);
    try {
      if (kind === 'delete') {
        const path = { project: 'projects', task: 'tasks', snapshot: 'snapshots' }[modal.type];
        await mutate(`/${path}/${item.id}`, undefined, 'DELETE', 'deleted');
      } else if (kind === 'snapshot')
        await mutate(
          '/snapshots',
          { projectId: form.projectId, name: form.name.trim() },
          'POST',
          'snapshotSaved',
        );
      else {
        const body = editorPayload(kind, form, { editing: !!item, manager });
        await mutate(
          `/${kind === 'project' ? 'projects' : kind === 'member' ? 'members' : 'tasks'}${item ? `/${item.id}` : ''}`,
          body,
          item ? 'PATCH' : 'POST',
          kind === 'task'
            ? body.status === 'done'
              ? 'taskCompleted'
              : item
                ? 'taskUpdated'
                : 'taskCreated'
            : !item
              ? `${kind}Created`
              : 'saved',
        );
      }
      close();
    } catch (err) {
      setError(err.code && strings.en[err.code] ? t(err.code) : t('error'));
    } finally {
      setBusy(false);
    }
  }
  async function addComment() {
    if (!comment.trim()) return;
    setBusy(true);
    setError('');
    try {
      await mutate(`/tasks/${item.id}/comments`, { text: comment.trim() }, 'POST', 'commentSaved');
      setComments((previous) => [
        ...previous,
        {
          id: Date.now(),
          text: comment.trim(),
          authorName: user.name,
          createdAt: new Date().toISOString(),
        },
      ]);
      setComment('');
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} close={close} closeLabel={t('close')} wide={kind === 'task'}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {kind === 'delete' ? (
            <div className="delete-message">
              <span className="delete-icon">
                <Trash2 size={26} />
              </span>
              <h3>{item.title || item.name}</h3>
              <p>{t(`delete${modal.type[0].toUpperCase() + modal.type.slice(1)}Warning`)}</p>
            </div>
          ) : (
            <>
              {kind === 'project' && (
                <div className="form-grid">
                  <Field label={`${t('projectName')} *`} full>
                    <input
                      className="input"
                      required
                      maxLength={120}
                      value={form.name}
                      placeholder={t('projectNamePlaceholder')}
                      onChange={(e) => set('name', e.target.value)}
                    />
                  </Field>
                  <Field label={t('description')} full>
                    <textarea
                      className="textarea"
                      rows={3}
                      maxLength={2000}
                      placeholder={t('descriptionPlaceholder')}
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                    />
                  </Field>
                  <Field label={t('startDate')}>
                    <input
                      className="input"
                      type="date"
                      value={form.startDate?.slice(0, 10) || ''}
                      onChange={(e) => set('startDate', e.target.value)}
                    />
                  </Field>
                  <Field label={`${t('dueDate')} *`}>
                    <input
                      className="input"
                      required
                      type="date"
                      min={form.startDate}
                      value={form.dueDate?.slice(0, 10) || ''}
                      onChange={(e) => set('dueDate', e.target.value)}
                    />
                  </Field>
                  <Field label={t('status')}>
                    <select
                      className="select"
                      value={form.status}
                      onChange={(e) => set('status', e.target.value)}
                    >
                      {['active', 'paused', 'completed', 'archived'].map((status) => (
                        <option key={status} value={status}>
                          {t(status)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('color')}>
                    <div className="color-options">
                      {colors.map((color) => (
                        <button
                          type="button"
                          className={form.color === color ? 'selected' : ''}
                          aria-label={color}
                          aria-pressed={form.color === color}
                          key={color}
                          style={{ background: color }}
                          onClick={() => set('color', color)}
                        >
                          {form.color === color && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="field full">
                    <span>{t('selectMembers')}</span>
                    <div className="member-checkboxes">
                      {data.members.map((member) => (
                        <label className="checkbox-row" key={member.id}>
                          <input
                            type="checkbox"
                            checked={form.memberIds?.includes(member.id)}
                            onChange={(e) =>
                              set(
                                'memberIds',
                                e.target.checked
                                  ? [...(form.memberIds || []), member.id]
                                  : form.memberIds.filter((id) => id !== member.id),
                              )
                            }
                          />
                          <Avatar member={member} size="small" />
                          <span>{member.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {kind === 'member' && (
                <div className="form-grid">
                  <Field label={`${t('name')} *`} full>
                    <input
                      className="input"
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder={t('namePlaceholder')}
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                    />
                  </Field>
                  <Field label={`${t('email')} *`} full>
                    <input
                      className="input"
                      type="email"
                      required
                      value={form.email}
                      placeholder="name@example.com"
                      onChange={(e) => set('email', e.target.value)}
                    />
                  </Field>
                  <Field label={t('role')}>
                    <select
                      className="select"
                      disabled={user.role !== 'admin' || item?.id === user.id}
                      value={form.role}
                      onChange={(e) => set('role', e.target.value)}
                    >
                      {['member', 'manager', 'admin'].map((role) => (
                        <option key={role} value={role}>
                          {t(role)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('weeklyCapacity')}>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={168}
                      required
                      value={form.capacityHours}
                      onChange={(e) => set('capacityHours', number(e.target.value))}
                    />
                  </Field>
                  {!item && (
                    <Field label={t('newAccountPassword')} full hint={t('passwordHint')}>
                      <input
                        className="input"
                        type="password"
                        minLength={12}
                        maxLength={128}
                        autoComplete="new-password"
                        value={form.password || ''}
                        onChange={(e) => set('password', e.target.value)}
                      />
                    </Field>
                  )}
                  <p className="form-note full">{t('memberNote')}</p>
                </div>
              )}
              {kind === 'snapshot' && (
                <div className="form-grid">
                  <Field label={`${t('project')} *`} full>
                    <select
                      className="select"
                      required
                      value={form.projectId}
                      onChange={(e) => set('projectId', e.target.value)}
                    >
                      {data.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`${t('snapshotName')} *`} full>
                    <input
                      className="input"
                      required
                      maxLength={120}
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                    />
                  </Field>
                </div>
              )}
              {kind === 'task' && (
                <>
                  <div className="form-grid">
                    <Field label={`${t('taskTitle')} *`} full hint={t('taskTitleHint')}>
                      <input
                        className="input title-input"
                        required
                        minLength={3}
                        maxLength={180}
                        disabled={!manager}
                        value={form.title}
                        placeholder={t('taskNamePlaceholder')}
                        onChange={(e) => set('title', e.target.value)}
                      />
                    </Field>
                    <Field label={t('description')} full>
                      <textarea
                        className="textarea"
                        rows={3}
                        maxLength={4000}
                        disabled={!manager}
                        value={form.description}
                        placeholder={t('descriptionPlaceholder')}
                        onChange={(e) => set('description', e.target.value)}
                      />
                    </Field>
                    <Field label={t('project')}>
                      <select
                        className="select"
                        disabled={!!item || !manager}
                        value={form.projectId}
                        onChange={(e) => {
                          set('projectId', e.target.value);
                          set('dependencies', []);
                          set('assigneeId', '');
                        }}
                      >
                        {data.projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t('assignee')}>
                      <select
                        className="select"
                        disabled={!manager}
                        value={form.assigneeId || ''}
                        onChange={(e) => set('assigneeId', e.target.value)}
                      >
                        <option value="">{t('unassigned')}</option>
                        {data.members
                          .filter((member) =>
                            data.projects
                              .find((project) => project.id === form.projectId)
                              ?.memberIds?.includes(member.id),
                          )
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label={t('status')}>
                      <select
                        className="select"
                        disabled={!canEditTask}
                        value={form.status}
                        onChange={(e) => {
                          set('status', e.target.value);
                          if (e.target.value === 'done') set('progress', 100);
                        }}
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {t(status)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t('priority')}>
                      <select
                        className="select"
                        disabled={!manager}
                        value={form.priority}
                        onChange={(e) => set('priority', e.target.value)}
                      >
                        {priorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {t(priority)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={`${t('startDate')} *`}>
                      <input
                        className="input"
                        type="date"
                        required
                        disabled={!manager}
                        value={form.startDate?.slice(0, 10) || ''}
                        onChange={(e) => set('startDate', e.target.value)}
                      />
                    </Field>
                    <Field label={`${t('dueDate')} *`}>
                      <input
                        className="input"
                        type="date"
                        required
                        disabled={!manager}
                        min={form.startDate?.slice(0, 10)}
                        value={form.dueDate?.slice(0, 10) || ''}
                        onChange={(e) => set('dueDate', e.target.value)}
                      />
                    </Field>
                    <Field label={t('plannedHours')} hint={t('plannedHoursHint')}>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        max={100000}
                        step="0.5"
                        disabled={!manager}
                        required
                        value={form.plannedHours}
                        onChange={(e) => set('plannedHours', number(e.target.value))}
                      />
                    </Field>
                    <Field label={t('actualHours')} hint={t('actualHoursHint')}>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        max={100000}
                        step="0.5"
                        disabled={!canEditTask}
                        required
                        value={form.actualHours}
                        onChange={(e) => set('actualHours', number(e.target.value))}
                      />
                    </Field>
                    <Field
                      label={`${t('progress')} · ${form.progress}%`}
                      full
                      hint={t('progressHint')}
                    >
                      <input
                        className="range"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        disabled={!canEditTask || form.status === 'done'}
                        value={form.progress}
                        onChange={(e) => set('progress', number(e.target.value))}
                      />
                    </Field>
                    <div className="field full">
                      <span>{t('subtasks')}</span>
                      <small>{t('subtaskHint')}</small>
                      <div className="subtask-editor">
                        {form.subtasks.map((subtask, index) => (
                          <div className="subtask-row" key={subtask.id}>
                            <input
                              aria-label={subtask.title}
                              type="checkbox"
                              disabled={!canEditTask}
                              checked={subtask.done}
                              onChange={(e) =>
                                set(
                                  'subtasks',
                                  form.subtasks.map((s, i) =>
                                    i === index ? { ...s, done: e.target.checked } : s,
                                  ),
                                )
                              }
                            />
                            <span className={subtask.done ? 'checked' : ''}>{subtask.title}</span>
                            {manager && (
                              <button
                                type="button"
                                className="icon-button tiny"
                                aria-label={t('remove')}
                                onClick={() =>
                                  set(
                                    'subtasks',
                                    form.subtasks.filter((_, i) => i !== index),
                                  )
                                }
                              >
                                <X size={15} />
                              </button>
                            )}
                          </div>
                        ))}
                        {manager && (
                          <div className="subtask-add">
                            <input
                              className="input"
                              value={newSubtask}
                              maxLength={200}
                              placeholder={t('subtaskTitle')}
                              onChange={(e) => setNewSubtask(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (newSubtask.trim()) {
                                    set('subtasks', [
                                      ...form.subtasks,
                                      {
                                        id: crypto.randomUUID(),
                                        title: newSubtask.trim(),
                                        done: false,
                                      },
                                    ]);
                                    setNewSubtask('');
                                  }
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="button secondary small"
                              disabled={!newSubtask.trim()}
                              onClick={() => {
                                set('subtasks', [
                                  ...form.subtasks,
                                  {
                                    id: crypto.randomUUID(),
                                    title: newSubtask.trim(),
                                    done: false,
                                  },
                                ]);
                                setNewSubtask('');
                              }}
                            >
                              <Plus size={16} />
                              {t('addSubtask')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {manager &&
                      data.tasks.some(
                        (task) => task.projectId === form.projectId && task.id !== item?.id,
                      ) && (
                        <div className="field full">
                          <span>{t('dependencies')}</span>
                          <div className="dependency-list">
                            {data.tasks
                              .filter(
                                (task) => task.projectId === form.projectId && task.id !== item?.id,
                              )
                              .map((task) => (
                                <label className="checkbox-row" key={task.id}>
                                  <input
                                    type="checkbox"
                                    checked={form.dependencies.includes(task.id)}
                                    onChange={(e) =>
                                      set(
                                        'dependencies',
                                        e.target.checked
                                          ? [...form.dependencies, task.id]
                                          : form.dependencies.filter((id) => id !== task.id),
                                      )
                                    }
                                  />
                                  <span>{task.title}</span>
                                  <Badge value={task.status} t={t} />
                                </label>
                              ))}
                          </div>
                        </div>
                      )}
                  </div>
                  {item?.risk && (
                    <div className="risk-breakdown">
                      <div className="risk-breakdown-title">
                        <h3>{t('riskScore')}</h3>
                        <span className={`risk-number ${item.risk.level}`}>
                          {riskScore(item)}/100
                        </span>
                      </div>
                      <p>{t('riskExplanation')}</p>
                      <div className="risk-components">
                        {Object.entries(item.risk.components || {}).map(([key, value]) => (
                          <div className="risk-component" key={key}>
                            <span>{t(key)}</span>
                            <Progress value={number(value) * 100} color="#e1a055" />
                            <strong>{Math.round(number(value) * 100)}%</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {item && (
                    <section className="comments-section">
                      <h3>{t('comments')}</h3>
                      {!comments.length && (
                        <p className="comment-placeholder">{t('commentsEmpty')}</p>
                      )}
                      {comments.map((comment) => (
                        <div className="comment" key={comment.id}>
                          <div>
                            <strong>{comment.authorName || comment.author || 'Orbit'}</strong>
                            <small>
                              {formatDate(comment.createdAt, t('dateLocale'), {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </small>
                          </div>
                          <p>{comment.text}</p>
                        </div>
                      ))}
                      <div className="comment-add">
                        <input
                          className="input"
                          maxLength={2000}
                          placeholder={t('commentPlaceholder')}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                        <button
                          className="button secondary"
                          type="button"
                          disabled={!comment.trim() || busy}
                          onClick={addComment}
                          aria-label={t('sendComment')}
                        >
                          <Send size={17} />
                        </button>
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {error && (
            <div className="error-message" role="alert">
              <AlertCircle size={17} />
              {error}
            </div>
          )}
        </div>
        <footer className="modal-footer">
          {item && manager && ['task', 'project'].includes(kind) && (
            <button
              className="button ghost danger-text"
              type="button"
              disabled={busy}
              onClick={() => setModal({ kind: 'delete', type: kind, item })}
            >
              <Trash2 size={16} />
              {t('delete')}
            </button>
          )}
          <span className="modal-spacer" />
          <button className="button secondary" type="button" disabled={busy} onClick={close}>
            {t('cancel')}
          </button>
          <button
            className={`button ${kind === 'delete' ? 'danger' : 'primary'}`}
            disabled={busy || (kind === 'task' && !canEditTask)}
            type="submit"
          >
            {busy ? (
              <span className="spinner" />
            ) : kind === 'delete' ? (
              <Trash2 size={16} />
            ) : (
              <Check size={16} />
            )}{' '}
            {t(kind === 'delete' ? 'delete' : 'save')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
