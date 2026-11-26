import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Download,
  Flag,
  FolderKanban,
  Globe2,
  Layers3,
  LayoutDashboard,
  LayoutGrid,
  List,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
  X,
  AlertCircle,
  Activity,
  Pencil,
  Orbit,
} from 'lucide-react';
import { strings, translate } from './i18n.js';
import { weightedProgress, workloadFor } from '../shared/metrics.js';
import { csvCell } from './forms.js';
import { api } from './lib/api.js';
import { today, number, riskScore, isHighRisk, formatDate, dueInfo } from './lib/format.js';
import { statuses, priorities } from './lib/constants.js';
import { Avatar, Progress, Badge, Empty, Stat, Language, ProjectFilter } from './components/ui.jsx';
import { Login } from './components/Login.jsx';
import { Editor } from './components/Editor.jsx';
import { SnapshotComparison } from './components/SnapshotComparison.jsx';
import { DailyFocus } from './components/DailyFocus.jsx';
import { deadlineLabel } from './lib/daily-focus.js';

const blank = { projects: [], tasks: [], members: [], events: [], snapshots: [] };
const average = (tasks) => weightedProgress(tasks);
const planned = (tasks, now = new Date()) => weightedProgress(tasks, now);

export default function App() {
  const [lang, setLang] = useState(() =>
    localStorage.getItem('orbit-language') === 'en' ? 'en' : 'ru',
  );
  const t = useCallback((key, values) => translate(lang, key, values), [lang]);
  const [data, setData] = useState(blank),
    [user, setUser] = useState(null),
    [loading, setLoading] = useState(true);
  const [page, setPage] = useState('overview'),
    [projectId, setProjectId] = useState('all'),
    [query, setQuery] = useState('');
  const [riskOnly, setRiskOnly] = useState(false);
  const [taskView, setTaskView] = useState('board'),
    [statusFilter, setStatusFilter] = useState('all'),
    [priorityFilter, setPriorityFilter] = useState('all');
  const [modal, setModal] = useState(null),
    [toast, setToast] = useState(null),
    [error, setError] = useState(''),
    [mobile, setMobile] = useState(false);
  const manager = user?.role === 'manager' || user?.role === 'admin';
  useEffect(() => {
    localStorage.setItem('orbit-language', lang);
    document.documentElement.lang = lang;
  }, [lang]);
  const reload = useCallback(async () => {
    try {
      const result = await api('/bootstrap');
      setData({ ...blank, ...result });
      setUser(result.user);
      setProjectId((previous) =>
        previous !== 'all' && !result.projects.some((p) => p.id === previous) ? 'all' : previous,
      );
      return result;
    } catch (err) {
      if (err.status === 401) {
        setUser(null);
        setData(blank);
        setModal(null);
      }
      throw err;
    }
  }, []);
  useEffect(() => {
    reload()
      .catch((err) => {
        if (err.status !== 401) setError(err.code === 'networkError' ? 'networkError' : 'error');
      })
      .finally(() => setLoading(false));
  }, [reload]);
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if (!document.hidden) reload().catch(() => {});
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [!!user, reload]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  const closeModal = useCallback(() => setModal(null), []);
  function navigate(next, project = projectId) {
    setPage(next);
    setProjectId(project);
    setMobile(false);
    setQuery('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setRiskOnly(false);
  }
  function clearTaskFilters() {
    setProjectId('all');
    setQuery('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setRiskOnly(false);
  }
  async function mutate(path, body, method = 'POST', success = 'saved') {
    await api(path, { method, body });
    await reload();
    setToast({ text: t(success), type: 'success' });
  }
  async function changeStatus(task, status) {
    try {
      await mutate(
        `/tasks/${task.id}`,
        { status, ...(status === 'done' ? { progress: 100 } : {}) },
        'PATCH',
        status === 'done' ? 'taskCompleted' : 'taskUpdated',
      );
    } catch {
      setToast({ text: t('error'), type: 'error' });
    }
  }
  function newTask() {
    if (!data.projects.length) {
      setModal({ kind: 'project' });
    } else
      setModal({ kind: 'task', projectId: projectId === 'all' ? data.projects[0].id : projectId });
  }
  const filteredProjects = data.projects.filter(
    (project) =>
      (projectId === 'all' || project.id === projectId) &&
      (!query ||
        `${project.name} ${project.description}`.toLowerCase().includes(query.toLowerCase())),
  );
  const projectTasks = data.tasks.filter(
    (task) => projectId === 'all' || task.projectId === projectId,
  );
  const filteredTasks = projectTasks.filter(
    (task) =>
      (!riskOnly || (task.status !== 'done' && number(task.risk?.score) >= 0.35)) &&
      (statusFilter === 'all' || task.status === statusFilter) &&
      (priorityFilter === 'all' || task.priority === priorityFilter) &&
      (!query ||
        `${task.title} ${task.description} ${data.projects.find((p) => p.id === task.projectId)?.name || ''} ${data.members.find((m) => m.id === task.assigneeId)?.name || ''}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const highRisk = [...projectTasks]
    .filter((task) => task.status !== 'done' && number(task.risk?.score) >= 0.35)
    .sort((a, b) => number(b.risk?.score) - number(a.risk?.score));
  const workloads = data.members
    .filter(
      (member) =>
        projectId === 'all' ||
        data.projects.find((p) => p.id === projectId)?.memberIds.includes(member.id),
    )
    .map((member) => ({
      ...member,
      effort: workloadFor(member, projectTasks).hours,
      count: projectTasks.filter((task) => task.assigneeId === member.id && task.status !== 'done')
        .length,
    }));
  const memberFor = (id) => data.members.find((member) => member.id === id);
  const projectFor = (id) => data.projects.find((project) => project.id === id);
  const filteredSnapshots = data.snapshots
    .filter((snapshot) => projectId === 'all' || snapshot.projectId === projectId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const scopedProjects = data.projects.filter(
    (project) => projectId === 'all' || project.id === projectId,
  );
  const currentProgress = average(projectTasks),
    planProgress = planned(projectTasks);
  const nav = [
    { key: 'overview', icon: LayoutDashboard },
    { key: 'projects', icon: FolderKanban },
    { key: 'tasks', icon: Layers3 },
    { key: 'team', icon: Users },
    { key: 'analytics', icon: BarChart3 },
    { key: 'activity', icon: Activity },
  ];
  const date = new Date().toLocaleDateString(t('dateLocale'), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const titleKey = page === 'overview' ? 'overviewTitle' : `${page}Title`;
  const subKey = page === 'overview' ? 'overviewSubtitle' : `${page}Subtitle`;

  if (loading)
    return (
      <div className="loading-page">
        <Orbit size={38} />
        <span className="spinner" />
        <p>{t('loading')}</p>
      </div>
    );
  if (!user)
    return (
      <>
        <Login t={t} lang={lang} setLang={setLang} onLogin={reload} />
        {error && (
          <div className="toast error" role="alert">
            <AlertCircle size={18} />
            {t(error)}
            <button className="icon-button" onClick={() => setError('')} aria-label={t('close')}>
              <X size={17} />
            </button>
          </div>
        )}
      </>
    );

  function TaskCard({ task }) {
    const member = memberFor(task.assigneeId),
      project = projectFor(task.projectId);
    return (
      <article
        className="task-card"
        draggable={manager}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
      >
        <div className="task-card-top">
          <span className="project-tag" style={{ color: project?.color }}>
            <span style={{ background: project?.color }} />
            {project?.name}
          </span>
          <button
            className="icon-button tiny"
            title={t('details')}
            aria-label={`${t('details')}: ${task.title}`}
            onClick={() => setModal({ kind: 'task', item: task })}
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
        <button className="task-title" onClick={() => setModal({ kind: 'task', item: task })}>
          {task.title}
        </button>
        {task.description && <p className="task-card-description">{task.description}</p>}
        <div className="task-card-badges">
          <Badge value={task.priority} t={t} />
          {isHighRisk(task) && (
            <span className="risk-label">
              <Flag size={12} />
              {riskScore(task)}%
            </span>
          )}
        </div>
        {task.progress > 0 && (
          <div className="task-progress">
            <Progress value={task.progress} />
            <small>{task.progress}%</small>
          </div>
        )}
        <div className="task-card-footer">
          <span className={`task-date ${dueInfo(task) ? 'overdue' : ''}`}>
            <CalendarDays size={13} />
            {deadlineLabel(task, t)}
          </span>
          {task.subtasks?.length > 0 && (
            <span className="subtask-count">
              <CheckCircle2 size={13} />
              {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
            </span>
          )}
          <Avatar member={member} size="small" title={member?.name || t('unassigned')} />
        </div>
      </article>
    );
  }
  function ProjectRow({ project }) {
    const tasks = data.tasks.filter((task) => task.projectId === project.id);
    return (
      <button className="project-row" onClick={() => navigate('tasks', project.id)}>
        <span className="project-symbol" style={{ '--project-color': project.color }}>
          <FolderKanban size={20} />
        </span>
        <span className="project-info">
          <strong>{project.name}</strong>
          <small>
            {t('taskCountValue', { count: tasks.length })} <span>·</span>{' '}
            {formatDate(project.dueDate, t('dateLocale'))}
          </small>
        </span>
        <span className="project-row-progress">
          <strong>{average(tasks)}%</strong>
          <Progress value={average(tasks)} color={project.color} />
        </span>
      </button>
    );
  }
  function WorkloadRows({ limit }) {
    return workloads.slice(0, limit || workloads.length).map((member) => (
      <div className="team-row" key={member.id}>
        <Avatar member={member} />
        <div className="team-info">
          <div>
            <strong>{member.name}</strong>
            <span className={member.effort > member.capacityHours ? 'text-orange' : ''}>
              {member.effort}
              <span className="muted">
                {' '}
                / {member.capacityHours}
                {t('hoursShort')}
              </span>
            </span>
          </div>
          <Progress
            value={(member.effort / (member.capacityHours || 1)) * 100}
            color={member.effort > member.capacityHours ? '#e7a253' : member.color}
          />
        </div>
      </div>
    ));
  }
  function csvExport() {
    const rows = [
      [
        t('taskTitle'),
        t('project'),
        t('status'),
        t('assignee'),
        t('priority'),
        t('dueDate'),
        t('progress'),
        t('plannedHours'),
        t('actualHours'),
        t('riskScore'),
      ],
      ...filteredTasks.map((task) => [
        task.title,
        projectFor(task.projectId)?.name,
        t(task.status),
        memberFor(task.assigneeId)?.name || '',
        t(task.priority),
        task.dueDate,
        task.progress,
        task.plannedHours,
        task.actualHours,
        riskScore(task),
      ]),
    ];
    const blob = new Blob(['\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const href = URL.createObjectURL(blob),
      anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `orbit-tasks-${today()}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="mobile-overlay"
          aria-label={t('close')}
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <button className="brand" onClick={() => navigate('overview')}>
          <span className="brand-icon">
            <Orbit size={27} />
          </span>
          orbit<span className="brand-period">.</span>
        </button>
        <div className="workspace-badge">
          <span className="workspace-mark">O</span>
          <div>
            <strong>{t('workspaceName')}</strong>
            <small>{t('workspaceLabel')}</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="sidebar-section">{t('workspace')}</div>
        <nav>
          {nav.slice(0, 4).map(({ key, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${page === key ? 'active' : ''}`}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              <span>{t(key)}</span>
              {key === 'tasks' && (
                <span className="nav-count">
                  {data.tasks.filter((task) => task.status !== 'done').length}
                </span>
              )}
            </button>
          ))}
          <div className="sidebar-section second">{t('insights')}</div>
          {nav.slice(4).map(({ key, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${page === key ? 'active' : ''}`}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              <span>{t(key)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="sidebar-note-icon">
              <Sparkles size={19} />
            </span>
            <strong>{t('workspaceSub')}</strong>
            <span>{t('workspaceTagline')}</span>
          </div>
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={19} />
            <span>{t('settings')}</span>
          </button>
          <div className="user-card">
            <Avatar member={user} />
            <div>
              <strong>{user.name}</strong>
              <small>{t(user.role)}</small>
            </div>
            <button
              className="icon-button"
              aria-label={t('logout')}
              title={t('logout')}
              onClick={async () => {
                try {
                  await api('/auth/logout', { method: 'POST' });
                  setUser(null);
                  setData(blank);
                  setPage('overview');
                  setProjectId('all');
                } catch {
                  setToast({ text: t('error'), type: 'error' });
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={t('openNavigation')}
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>{t('workspaceName')}</span>
            <ChevronRight size={13} />
            <strong>{t(page)}</strong>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (page !== 'projects') setPage('tasks');
                }}
                aria-label={t('search')}
                placeholder={t('search')}
              />
              {query ? (
                <button
                  className="icon-button tiny"
                  aria-label={t('clearFilters')}
                  onClick={() => setQuery('')}
                >
                  <X size={14} />
                </button>
              ) : (
                <span className="search-decoration">⌕</span>
              )}
            </div>
            <Language lang={lang} setLang={setLang} />
            <button
              className="icon-button notification-button"
              title={t('riskWatch')}
              aria-label={t('riskWatch')}
              onClick={() => {
                navigate('tasks');
                setRiskOnly(true);
              }}
            >
              <Bell size={19} />
              {highRisk.length > 0 && <span className="notification-dot" />}
            </button>
            <Avatar member={user} size="small" />
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === 'overview' ? (
                  <>
                    <span className="live-dot" />
                    {t('overviewEyebrow')}
                  </>
                ) : (
                  t(page).toUpperCase()
                )}
              </div>
              <h1>
                {page === 'overview'
                  ? t(user.name?.trim() ? 'greetingNamed' : 'greeting', {
                      name: user.name?.trim().split(/\s+/)[0],
                    })
                  : t(titleKey)}
              </h1>
              <p>{t(subKey)}</p>
            </div>
            <div className="heading-actions">
              {page === 'overview' && (
                <span className="date-chip">
                  <CalendarDays size={15} />
                  {date}
                </span>
              )}
              {manager && ['overview', 'tasks'].includes(page) && (
                <button className="button primary" onClick={newTask}>
                  <Plus size={17} />
                  {t('newTask')}
                </button>
              )}
              {manager && page === 'projects' && (
                <button className="button primary" onClick={() => setModal({ kind: 'project' })}>
                  <Plus size={17} />
                  {t('newProject')}
                </button>
              )}
              {manager && page === 'team' && (
                <button className="button primary" onClick={() => setModal({ kind: 'member' })}>
                  <Plus size={17} />
                  {t('newMember')}
                </button>
              )}
              {manager && page === 'analytics' && (
                <button
                  className="button primary"
                  disabled={!data.projects.length}
                  onClick={() =>
                    setModal({
                      kind: 'snapshot',
                      projectId: projectId === 'all' ? data.projects[0]?.id : projectId,
                    })
                  }
                >
                  <Plus size={17} />
                  {t('newSnapshot')}
                </button>
              )}
            </div>
          </div>

          {page === 'overview' && (
            <>
              <DailyFocus
                tasks={projectTasks}
                members={data.members}
                projects={data.projects}
                user={user}
                manager={manager}
                t={t}
                openTask={(task) => setModal({ kind: 'task', item: task })}
                openBoard={() => navigate('tasks')}
              />
              <div className="stats-grid">
                <Stat
                  icon={FolderKanban}
                  title={t('activeProjects')}
                  value={scopedProjects.filter((p) => p.status === 'active').length}
                  note={t('projectCount', { count: scopedProjects.length })}
                  color="purple"
                />
                <Stat
                  icon={CheckCircle2}
                  title={t('openTasks')}
                  value={projectTasks.filter((task) => task.status !== 'done').length}
                  note={t('completedCount', {
                    count: projectTasks.filter((task) => task.status === 'done').length,
                  })}
                  color="blue"
                />
                <Stat
                  icon={TrendingUp}
                  title={t('teamProgress')}
                  value={
                    <>
                      {currentProgress}
                      <small>%</small>
                    </>
                  }
                  note={t('averageCompletion')}
                  color="green"
                />
                <Stat
                  icon={Flag}
                  title={t('atRisk')}
                  value={projectTasks.filter(isHighRisk).length}
                  note={t('highRiskCount', { count: projectTasks.filter(isHighRisk).length })}
                  color="orange"
                />
              </div>
              <div className="dashboard-grid">
                <section className="card pulse-card">
                  <div className="card-header">
                    <div>
                      <h2>{t('projectPulse')}</h2>
                      <p>{t('progressByProject')}</p>
                    </div>
                    <span className="card-chip">
                      <span className="live-dot" />
                      {t('current')}
                    </span>
                  </div>
                  <div className="pulse-summary">
                    <span>
                      <strong>{currentProgress}%</strong>
                      <small>{t('actualProgress')}</small>
                    </span>
                    <span className="pulse-gap">
                      <TrendingUp size={16} />
                      {currentProgress - planProgress > 0 ? '+' : ''}
                      {currentProgress - planProgress} {t('pp')}
                      <small>{t('progressGap')}</small>
                    </span>
                  </div>
                  <div className="project-chart">
                    {scopedProjects.length ? (
                      scopedProjects.map((project) => {
                        const tasks = data.tasks.filter((task) => task.projectId === project.id);
                        return (
                          <div className="chart-project" key={project.id}>
                            <div className="chart-project-label">
                              <span>{project.name}</span>
                              <strong>{average(tasks)}%</strong>
                            </div>
                            <div className="chart-bars">
                              <div
                                className="chart-bar plan"
                                style={{ width: `${planned(tasks)}%` }}
                              />
                              <div
                                className="chart-bar fact"
                                style={{ width: `${average(tasks)}%`, background: project.color }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <Empty title={t('noProjects')} description={t('noProjectsSub')} />
                    )}
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-dot planned" />
                      {t('plan')}
                    </span>
                    <span>
                      <i className="legend-dot actual" />
                      {t('fact')}
                    </span>
                    <span className="chart-note">{t('planFact')}</span>
                  </div>
                </section>
                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2>{t('yourProjects')}</h2>
                      <p>{t('projectCount', { count: scopedProjects.length })}</p>
                    </div>
                    <button className="text-link" onClick={() => navigate('projects')}>
                      {t('viewAll')}
                    </button>
                  </div>
                  <div className="project-list">
                    {filteredProjects.slice(0, 4).map((project) => (
                      <ProjectRow key={project.id} project={project} />
                    ))}
                    {!filteredProjects.length && (
                      <Empty
                        title={t(query ? 'noMatches' : 'noProjects')}
                        description={t(query ? 'noMatchesSub' : 'noProjectsSub')}
                      />
                    )}
                  </div>
                  <div className="card-bottom">
                    <button
                      className="button ghost small"
                      onClick={() =>
                        manager ? setModal({ kind: 'project' }) : navigate('projects')
                      }
                    >
                      <Plus size={16} />
                      {t(manager ? 'newProject' : 'viewAll')}
                    </button>
                  </div>
                </section>
              </div>
              <div className="dashboard-grid bottom-grid">
                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2>
                        {t('riskWatch')}
                        <span className="count-pill orange">{highRisk.length}</span>
                      </h2>
                      <p>{t('riskWatchSub')}</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={t('viewTasks')}
                      onClick={() => navigate('tasks')}
                    >
                      <List size={19} />
                    </button>
                  </div>
                  <div className="risk-list">
                    {highRisk.slice(0, 4).map((task) => (
                      <button
                        className="risk-row"
                        key={task.id}
                        onClick={() => setModal({ kind: 'task', item: task })}
                      >
                        <span className={`risk-indicator ${task.risk?.level}`}>
                          <Flag size={16} />
                        </span>
                        <span className="risk-info">
                          <strong>{task.title}</strong>
                          <small>
                            {projectFor(task.projectId)?.name} <span>·</span>{' '}
                            {deadlineLabel(task, t)}
                          </small>
                        </span>
                        <span className="risk-score">
                          {riskScore(task)}
                          <small>/100</small>
                        </span>
                        <Avatar member={memberFor(task.assigneeId)} size="small" />
                      </button>
                    ))}
                    {!highRisk.length && (
                      <Empty
                        icon={ShieldCheck}
                        title={t('noRisks')}
                        description={t('noRisksSub')}
                      />
                    )}
                  </div>
                </section>
                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2>{t('teamWorkload')}</h2>
                      <p>{t('teamWorkloadSub')}</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={t('team')}
                      onClick={() => navigate('team')}
                    >
                      <List size={19} />
                    </button>
                  </div>
                  <div className="team-list">
                    <WorkloadRows limit={5} />
                  </div>
                </section>
              </div>
            </>
          )}

          {page === 'projects' && (
            <>
              <div className="section-toolbar">
                <span className="result-count">
                  {filteredProjects.length} {t('projects').toLowerCase()}
                </span>
                <ProjectFilter
                  t={t}
                  projects={data.projects}
                  value={projectId}
                  onChange={setProjectId}
                />
              </div>
              <div className="project-grid">
                {filteredProjects.map((project) => {
                  const tasks = data.tasks.filter((task) => task.projectId === project.id);
                  const members = data.members.filter((member) =>
                    project.memberIds?.includes(member.id),
                  );
                  return (
                    <article className="project-card" key={project.id}>
                      <div className="project-card-top">
                        <span
                          className="project-symbol large"
                          style={{ '--project-color': project.color }}
                        >
                          <FolderKanban size={25} />
                        </span>
                        <Badge value={project.status} t={t} />
                        {manager && (
                          <button
                            className="icon-button"
                            title={t('edit')}
                            onClick={() => setModal({ kind: 'project', item: project })}
                          >
                            <MoreHorizontal size={20} />
                          </button>
                        )}
                      </div>
                      <button
                        className="project-card-title"
                        onClick={() => navigate('tasks', project.id)}
                      >
                        {project.name}
                      </button>
                      <p className="project-card-description">
                        {project.description || t('noDescription')}
                      </p>
                      <div className="project-card-progress">
                        <span>{t('progress')}</span>
                        <strong>{average(tasks)}%</strong>
                      </div>
                      <Progress value={average(tasks)} color={project.color} />
                      <div className="project-card-meta">
                        <span>
                          <CheckCircle2 size={14} />
                          {tasks.filter((task) => task.status === 'done').length}/{tasks.length}{' '}
                          {t('taskCount')}
                        </span>
                        <span>
                          <CalendarDays size={14} />
                          {formatDate(project.dueDate, t('dateLocale'))}
                        </span>
                      </div>
                      <div className="project-card-footer">
                        <div className="avatar-stack">
                          {members.slice(0, 4).map((member) => (
                            <Avatar key={member.id} member={member} size="small" />
                          ))}
                          {members.length > 4 && (
                            <span className="avatar small extra">+{members.length - 4}</span>
                          )}
                        </div>
                        <button className="text-link" onClick={() => navigate('tasks', project.id)}>
                          {t('projectDetail')}
                        </button>
                      </div>
                    </article>
                  );
                })}
                {manager && !query && (
                  <button
                    className="new-project-card"
                    onClick={() => setModal({ kind: 'project' })}
                  >
                    <span>
                      <Plus size={26} />
                    </span>
                    <strong>{t('newProject')}</strong>
                    <small>{t('noProjectsSub')}</small>
                  </button>
                )}
              </div>
              {!filteredProjects.length && query && (
                <Empty icon={Search} title={t('noMatches')} description={t('noMatchesSub')} />
              )}
            </>
          )}

          {page === 'tasks' && (
            <>
              <div className="toolbar">
                <div className="segment-control">
                  <button
                    className={taskView === 'board' ? 'active' : ''}
                    onClick={() => setTaskView('board')}
                  >
                    <LayoutGrid size={15} />
                    {t('board')}
                  </button>
                  <button
                    className={taskView === 'list' ? 'active' : ''}
                    onClick={() => setTaskView('list')}
                  >
                    <List size={16} />
                    {t('list')}
                  </button>
                </div>
                <div className="filter-controls">
                  {riskOnly && (
                    <button className="button secondary small" onClick={() => setRiskOnly(false)}>
                      <Flag size={14} />
                      {t('atRisk')}
                      <X size={13} />
                    </button>
                  )}
                  <ProjectFilter
                    t={t}
                    projects={data.projects}
                    value={projectId}
                    onChange={setProjectId}
                  />
                  <select
                    className="select compact"
                    aria-label={t('status')}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">{t('allStatuses')}</option>
                    {statuses.map((status) => (
                      <option value={status} key={status}>
                        {t(status)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select compact"
                    aria-label={t('priority')}
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                  >
                    <option value="all">{t('allPriorities')}</option>
                    {priorities.map((priority) => (
                      <option value={priority} key={priority}>
                        {t(priority)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary small"
                    onClick={csvExport}
                    disabled={!filteredTasks.length}
                  >
                    <Download size={15} />
                    {t('export')}
                  </button>
                </div>
              </div>
              {!filteredTasks.length && (
                <section className="card task-empty-state">
                  <Empty
                    icon={Search}
                    title={t(projectTasks.length ? 'noMatches' : 'noTasks')}
                    description={t(projectTasks.length ? 'filteredEmpty' : 'noTasksSub')}
                    action={
                      data.tasks.length ? (
                        <button className="button secondary" onClick={clearTaskFilters}>
                          {t('resetTaskFilters')}
                        </button>
                      ) : manager ? (
                        <button className="button primary" onClick={newTask}>
                          {t('newTask')}
                        </button>
                      ) : null
                    }
                  />
                </section>
              )}
              {filteredTasks.length > 0 &&
                (taskView === 'board' ? (
                  <div className="kanban-board">
                    {statuses
                      .filter((status) => statusFilter === 'all' || status === statusFilter)
                      .map((status) => (
                        <section
                          className={`kanban-column ${status}`}
                          key={status}
                          onDragOver={(e) => manager && e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const task = data.tasks.find(
                              (task) => task.id === e.dataTransfer.getData('text/plain'),
                            );
                            if (task && manager && task.status !== status)
                              changeStatus(task, status);
                          }}
                        >
                          <div className="kanban-header">
                            <span className={`column-dot ${status}`} />
                            <h2>{t(status)}</h2>
                            <span className="count-pill">
                              {filteredTasks.filter((task) => task.status === status).length}
                            </span>
                            {manager && (
                              <button
                                className="icon-button tiny"
                                aria-label={`${t('newTask')}: ${t(status)}`}
                                onClick={() =>
                                  data.projects.length
                                    ? setModal({
                                        kind: 'task',
                                        projectId:
                                          projectId === 'all' ? data.projects[0].id : projectId,
                                        status,
                                      })
                                    : newTask()
                                }
                              >
                                <Plus size={16} />
                              </button>
                            )}
                          </div>
                          <div className="kanban-cards">
                            {filteredTasks
                              .filter((task) => task.status === status)
                              .map((task) => (
                                <TaskCard key={task.id} task={task} />
                              ))}
                            {!filteredTasks.some((task) => task.status === status) && (
                              <div className="column-empty">
                                <Circle size={19} />
                                <span>{t('emptyColumn')}</span>
                              </div>
                            )}
                          </div>
                        </section>
                      ))}
                  </div>
                ) : (
                  <div className="card table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t('taskTitle')}</th>
                          <th>{t('status')}</th>
                          <th>{t('assignee')}</th>
                          <th>{t('priority')}</th>
                          <th>{t('dueDate')}</th>
                          <th>{t('progress')}</th>
                          <th>{t('risk')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.map((task) => (
                          <tr key={task.id}>
                            <td>
                              <button
                                className="table-task-title"
                                onClick={() => setModal({ kind: 'task', item: task })}
                              >
                                {task.title}
                              </button>
                              <small className="table-project">
                                {projectFor(task.projectId)?.name}
                              </small>
                            </td>
                            <td>
                              <Badge value={task.status} t={t} />
                            </td>
                            <td>
                              <span className="table-member">
                                <Avatar member={memberFor(task.assigneeId)} size="small" />
                                <span>{memberFor(task.assigneeId)?.name || t('unassigned')}</span>
                              </span>
                            </td>
                            <td>
                              <Badge value={task.priority} t={t} />
                            </td>
                            <td className={dueInfo(task) ? 'text-orange' : ''}>
                              {deadlineLabel(task, t)}
                            </td>
                            <td>
                              <span className="table-progress">
                                <Progress value={task.progress} />
                                {task.progress}%
                              </span>
                            </td>
                            <td>
                              <span className={`risk-number ${task.risk?.level}`}>
                                {riskScore(task)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
            </>
          )}

          {page === 'team' && (
            <>
              <div className="stats-grid three">
                <Stat
                  icon={Users}
                  title={t('totalMembers')}
                  value={data.members.length}
                  note={t('workspaceName')}
                />
                <Stat
                  icon={Clock3}
                  title={t('totalCapacity')}
                  value={data.members.reduce(
                    (sum, member) => sum + number(member.capacityHours),
                    0,
                  )}
                  note={t('weeklyCapacity')}
                  color="blue"
                />
                <Stat
                  icon={Flag}
                  title={t('overloaded')}
                  value={workloads.filter((member) => member.effort > member.capacityHours).length}
                  note={t('teamWorkloadSub')}
                  color="orange"
                />
              </div>
              <div className="section-toolbar">
                <h2>{t('team')}</h2>
                <ProjectFilter
                  t={t}
                  projects={data.projects}
                  value={projectId}
                  onChange={setProjectId}
                />
              </div>
              <div className="team-grid">
                {workloads.map((member) => (
                  <article className="member-card" key={member.id}>
                    <div className="member-card-top">
                      <Avatar member={member} size="large" />
                      {manager && (
                        <button
                          className="icon-button"
                          aria-label={`${t('edit')}: ${member.name}`}
                          onClick={() => setModal({ kind: 'member', item: member })}
                        >
                          <MoreHorizontal size={19} />
                        </button>
                      )}
                    </div>
                    <h2>{member.name}</h2>
                    <p className="member-email">{member.email}</p>
                    <span className="role-tag">{t(member.role)}</span>
                    <div className="member-metrics">
                      <span>
                        <strong>{member.count}</strong>
                        <small>{t('openTasks')}</small>
                      </span>
                      <span>
                        <strong>
                          {member.effort}
                          <small>{t('hoursShort')}</small>
                        </strong>
                        <small>{t('remainingHours')}</small>
                      </span>
                    </div>
                    <div className="member-capacity">
                      <span>{t('teamWorkload')}</span>
                      <strong
                        className={
                          member.effort > member.capacityHours ? 'text-orange' : 'text-green'
                        }
                      >
                        {t(
                          member.effort > member.capacityHours
                            ? 'overCapacity'
                            : member.effort < member.capacityHours * 0.5
                              ? 'available'
                              : 'balanced',
                        )}
                      </strong>
                    </div>
                    <Progress
                      value={(member.effort / (member.capacityHours || 1)) * 100}
                      color={member.effort > member.capacityHours ? '#e7a253' : '#55a38e'}
                    />
                    <p className="capacity-note">
                      {member.effort} / {member.capacityHours} {t('hoursShort')} ·{' '}
                      {t('weeklyCapacity').toLowerCase()}
                    </p>
                  </article>
                ))}
              </div>
            </>
          )}

          {page === 'analytics' && (
            <>
              <div className="section-toolbar">
                <h2>{t('currentState')}</h2>
                <ProjectFilter
                  t={t}
                  projects={data.projects}
                  value={projectId}
                  onChange={setProjectId}
                />
              </div>
              <div className="stats-grid">
                <Stat
                  icon={Target}
                  title={t('plannedProgress')}
                  value={`${planProgress}%`}
                  note={t('plan')}
                  color="blue"
                />
                <Stat
                  icon={TrendingUp}
                  title={t('actualProgress')}
                  value={`${currentProgress}%`}
                  note={`${currentProgress - planProgress > 0 ? '+' : ''}${currentProgress - planProgress} ${t('pp')} ${t('progressGap').toLowerCase()}`}
                  color="green"
                />
                <Stat
                  icon={Clock3}
                  title={t('plannedEffort')}
                  value={projectTasks.reduce((sum, task) => sum + number(task.plannedHours), 0)}
                  note={t('hoursShort')}
                />
                <Stat
                  icon={Activity}
                  title={t('actualEffort')}
                  value={projectTasks.reduce((sum, task) => sum + number(task.actualHours), 0)}
                  note={t('hoursShort')}
                  color="orange"
                />
              </div>
              <div className="recommendation-banner">
                <span>
                  <Sparkles size={21} />
                </span>
                <div>
                  <strong>{t('recommendations')}</strong>
                  <p>
                    {t(
                      projectTasks.some(isHighRisk)
                        ? 'recommendationRisk'
                        : workloads.some((member) => member.effort > member.capacityHours)
                          ? 'recommendationLoad'
                          : currentProgress < planProgress - 10
                            ? 'recommendationProgress'
                            : 'recommendationClear',
                    )}
                  </p>
                </div>
              </div>
              <SnapshotComparison snapshots={filteredSnapshots} projects={data.projects} t={t} />
              <div className="section-toolbar">
                <h2>
                  {t('snapshots')}
                  <span className="count-pill">{filteredSnapshots.length}</span>
                </h2>
              </div>
              <div className="snapshot-grid">
                {filteredSnapshots.map((snapshot) => (
                  <article className="snapshot-card" key={snapshot.id}>
                    <div className="snapshot-top">
                      <span className="snapshot-icon">
                        <Layers3 size={20} />
                      </span>
                      <div>
                        <h3>{snapshot.name}</h3>
                        <small>{projectFor(snapshot.projectId)?.name}</small>
                      </div>
                      {manager && (
                        <button
                          className="icon-button"
                          aria-label={t('delete')}
                          onClick={() =>
                            setModal({ kind: 'delete', type: 'snapshot', item: snapshot })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <div className="snapshot-metrics">
                      <span>
                        <strong>{Math.round(number(snapshot.metrics?.progress))}%</strong>
                        <small>{t('progress')}</small>
                      </span>
                      <span>
                        <strong>
                          {snapshot.metrics?.completed ?? 0}/{snapshot.metrics?.taskCount ?? 0}
                        </strong>
                        <small>{t('finished')}</small>
                      </span>
                      <span>
                        <strong>{snapshot.metrics?.riskCount ?? 0}</strong>
                        <small>{t('riskCount')}</small>
                      </span>
                    </div>
                    <div className="snapshot-date">
                      <CalendarDays size={14} />
                      {formatDate(snapshot.createdAt, t('dateLocale'), {
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </article>
                ))}
              </div>
              {!filteredSnapshots.length && (
                <div className="card">
                  <Empty
                    icon={Layers3}
                    title={t('noSnapshots')}
                    description={t('noSnapshotsSub')}
                    action={
                      manager && (
                        <button
                          className="button primary"
                          disabled={!data.projects.length}
                          onClick={() =>
                            setModal({
                              kind: 'snapshot',
                              projectId: projectId === 'all' ? data.projects[0]?.id : projectId,
                            })
                          }
                        >
                          <Plus size={16} />
                          {t('newSnapshot')}
                        </button>
                      )
                    }
                  />
                </div>
              )}
            </>
          )}

          {page === 'activity' && (
            <>
              <div className="section-toolbar">
                <h2>{t('activity')}</h2>
                <ProjectFilter
                  t={t}
                  projects={data.projects}
                  value={projectId}
                  onChange={setProjectId}
                />
              </div>
              <div className="card activity-card">
                <div className="timeline">
                  {data.events
                    .filter((event) => projectId === 'all' || event.projectId === projectId)
                    .slice()
                    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
                    .map((event) => {
                      const type = event.type
                        ?.replace(/[._-]/g, ' ')
                        .split(' ')
                        .map((word) => word[0]?.toUpperCase() + word.slice(1))
                        .join('');
                      const details =
                        typeof event.details === 'string'
                          ? event.details
                          : event.details?.title || event.details?.name || '';
                      return (
                        <div className="timeline-item" key={event.id}>
                          <span className="timeline-marker">
                            <Activity size={16} />
                          </span>
                          <div className="timeline-content">
                            <p>
                              <strong>{event.actorName || 'Orbit'}</strong>{' '}
                              {strings[lang][`event${type}`] || t('eventDefault')}
                            </p>
                            {details && <span className="event-details">{details}</span>}
                            <small>{projectFor(event.projectId)?.name || t('workspaceName')}</small>
                          </div>
                          <time>
                            {formatDate(event.createdAt, t('dateLocale'), {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                      );
                    })}
                </div>
                {!data.events.filter(
                  (event) => projectId === 'all' || event.projectId === projectId,
                ).length && (
                  <Empty icon={Activity} title={t('noEvents')} description={t('noEventsSub')} />
                )}
              </div>
            </>
          )}

          {page === 'settings' && (
            <div className="settings-grid">
              <section className="card settings-card">
                <h2>{t('profile')}</h2>
                <div className="profile-heading">
                  <Avatar member={user} size="large" />
                  <div>
                    <h3>{user.name}</h3>
                    <span className="role-tag">{t(user.role)}</span>
                  </div>
                </div>
                <div className="setting-row">
                  <span>{t('email')}</span>
                  <strong>{user.email}</strong>
                </div>
                <div className="setting-row">
                  <span>{t('role')}</span>
                  <strong>{t(user.role)}</strong>
                </div>
                <button
                  className="button secondary"
                  onClick={() => setModal({ kind: 'member', item: memberFor(user.id) || user })}
                  disabled={!manager}
                >
                  <Pencil size={15} />
                  {t('edit')}
                </button>
              </section>
              <div className="settings-stack">
                <section className="card settings-card">
                  <span className="settings-card-icon">
                    <Globe2 size={20} />
                  </span>
                  <h2>{t('appearance')}</h2>
                  <p>{t('languageDescription')}</p>
                  <div className="language-options">
                    <button
                      className={lang === 'ru' ? 'selected' : ''}
                      onClick={() => setLang('ru')}
                    >
                      <span>RU</span>
                      <div>
                        <strong>Русский</strong>
                        <small>Russian</small>
                      </div>
                      {lang === 'ru' && <CheckCircle2 size={20} />}
                    </button>
                    <button
                      className={lang === 'en' ? 'selected' : ''}
                      onClick={() => setLang('en')}
                    >
                      <span>EN</span>
                      <div>
                        <strong>English</strong>
                        <small>Английский</small>
                      </div>
                      {lang === 'en' && <CheckCircle2 size={20} />}
                    </button>
                  </div>
                </section>
                <section className="card settings-card">
                  <h2>{t('storage')}</h2>
                  <p>{t('storageDescription')}</p>
                  <div className="storage-status">
                    <span className="live-dot" />
                    {t(
                      data.storageMode === 'mongo' || data.storageMode === 'mongodb'
                        ? 'mongoStorage'
                        : 'fileStorage',
                    )}
                    <ShieldCheck size={17} />
                  </div>
                </section>
                <section className="card settings-card">
                  <h2>{t('about')}</h2>
                  <p>{t('aboutDescription')}</p>
                  <div className="setting-row">
                    <span>{t('version')}</span>
                    <strong>1.0.0</strong>
                  </div>
                </section>
              </div>
            </div>
          )}
          <footer className="workspace-footer">
            <span>
              orbit<span>.</span>
            </span>
            <span>{t('workspaceSub')}</span>
            <span className="footer-status">
              <span className="live-dot" />
              {t(
                data.storageMode === 'mongo' || data.storageMode === 'mongodb'
                  ? 'mongoStorage'
                  : 'fileStorage',
              )}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.text}</span>
          <button
            className="icon-button tiny"
            aria-label={t('close')}
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <Editor
          key={`${modal.kind}-${modal.item?.id || 'new'}`}
          modal={modal}
          data={data}
          user={user}
          manager={manager}
          t={t}
          close={closeModal}
          mutate={mutate}
          setModal={setModal}
        />
      )}
    </div>
  );
}
