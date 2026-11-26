import { Coffee, CheckCircle2, CalendarDays } from 'lucide-react';
import { Avatar } from './ui.jsx';
import { nextStep, deadlineLabel } from '../lib/daily-focus.js';

export function DailyFocus({ tasks, members, projects, user, manager, t, openTask, openBoard }) {
  const focus = nextStep(tasks, user.id, manager);
  const task = focus?.task;
  const person = task && members.find((member) => member.id === task.assigneeId);
  const project = task && projects.find((project) => project.id === task.projectId);

  return (
    <section className={`daily-focus ${task ? '' : 'is-clear'}`} aria-labelledby="focus-title">
      <div className="focus-symbol" aria-hidden="true">
        {task ? <Coffee size={24} /> : <CheckCircle2 size={24} />}
      </div>
      <div className="focus-copy">
        <div className="focus-eyebrow">
          {t('focusLabel')}
          <span>{t(manager ? 'focusTeam' : 'focusPersonal')}</span>
        </div>
        <h2 id="focus-title">{task ? task.title : t('focusEmptyTitle')}</h2>
        <p>{t(task ? focus.key : manager ? 'focusEmptyBodyManager' : 'focusEmptyBodyMember')}</p>
        {task && (
          <div className="focus-context">
            <span>{project?.name}</span>
            <span className="focus-deadline">
              <CalendarDays size={14} aria-hidden="true" />
              {deadlineLabel(task, t)}
            </span>
            <span className="focus-person">
              <Avatar member={person} size="small" />
              {person?.name || t('unassigned')}
            </span>
          </div>
        )}
      </div>
      <button className="button focus-action" onClick={() => (task ? openTask(task) : openBoard())}>
        {t(task ? 'focusOpenTask' : 'focusBoard')}
      </button>
    </section>
  );
}
