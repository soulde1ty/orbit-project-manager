import { useEffect, useRef } from 'react';
import { FolderKanban, Globe2, X } from 'lucide-react';
import { initials, bounded } from '../lib/format.js';

export function Avatar({ member, size = '', title }) {
  return (
    <span
      title={title || member?.name}
      className={`avatar ${size}`}
      style={{ '--avatar-color': member?.color || '#7566e8' }}
    >
      {initials(member?.name)}
    </span>
  );
}

export function Progress({ value, color, subtle = false }) {
  return (
    <div
      className={`progress-track ${subtle ? 'subtle' : ''}`}
      role="progressbar"
      aria-valuenow={bounded(value)}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span className="progress-fill" style={{ width: `${bounded(value)}%`, background: color }} />
    </div>
  );
}

export function Badge({ value, t }) {
  return (
    <span className={`badge ${value}`}>
      <span />
      {t(value)}
    </span>
  );
}

export function Empty({ icon: Icon = FolderKanban, title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Stat({ icon: Icon, title, value, note, color = 'purple', trend }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{title}</span>
        <span className={`stat-icon ${color}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">
        {trend && <span className={`stat-trend ${color}`}>{trend}</span>}
        {note}
      </div>
    </div>
  );
}

export function Modal({ title, children, close, closeLabel, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input,select,textarea,button')?.focus();
    function key(event) {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const nodes = [
          ...ref.current.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
          ),
        ];
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', key);
      before?.focus();
    };
  }, [close]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={ref}
      >
        <header className="modal-header">
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="icon-button" aria-label={closeLabel} onClick={close}>
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Field({ label, children, full = false, hint }) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Language({ lang, setLang }) {
  return (
    <div className="language-switch">
      <Globe2 size={15} />
      <button
        className={lang === 'ru' ? 'active' : ''}
        onClick={() => setLang('ru')}
        aria-pressed={lang === 'ru'}
      >
        RU
      </button>
      <span>/</span>
      <button
        className={lang === 'en' ? 'active' : ''}
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
    </div>
  );
}

export function ProjectFilter({ t, projects, value, onChange }) {
  return (
    <div className="project-filter">
      <FolderKanban size={15} />
      <select
        className="select compact"
        aria-label={t('project')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="all">{t('allProjects')}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </div>
  );
}
