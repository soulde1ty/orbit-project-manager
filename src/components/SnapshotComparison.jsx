import { useState } from 'react';
import { BarChart3, ArrowRight, Layers3 } from 'lucide-react';
import { formatDate, number } from '../lib/format.js';
import { Field } from './ui.jsx';

export function SnapshotComparison({ snapshots, projects, t }) {
  const [leftId, setLeftId] = useState(''),
    [rightId, setRightId] = useState('');
  const right = snapshots.find((snapshot) => snapshot.id === rightId) || snapshots[0];
  const compatible = snapshots.filter(
    (snapshot) => snapshot.projectId === right?.projectId && snapshot.id !== right?.id,
  );
  const left =
    compatible.find((snapshot) => snapshot.id === leftId) || compatible[compatible.length - 1];
  const metrics = [
    ['progress', 'progress', '%'],
    ['plannedProgress', 'plannedProgress', '%'],
    ['averageRisk', 'averageRisk', '%', 100],
    ['overdueCount', 'overdue', ''],
    ['completed', 'finished', ''],
    ['riskCount', 'riskCount', ''],
    ['actualHours', 'actualHours', t('hoursShort')],
  ];
  return (
    <section className="card comparison-card">
      <div className="card-header">
        <div>
          <h2>{t('compare')}</h2>
          <p>
            {left && right
              ? projects.find((project) => project.id === right.projectId)?.name
              : t('needTwoSnapshots')}
          </p>
        </div>
        <span className="stat-icon purple">
          <BarChart3 size={18} />
        </span>
      </div>
      {left && right ? (
        <>
          <div className="comparison-selects">
            <Field label={t('baseline')}>
              <select
                className="select"
                value={left.id}
                onChange={(e) => setLeftId(e.target.value)}
              >
                {compatible.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {snapshot.name} ·{' '}
                    {formatDate(snapshot.createdAt, t('dateLocale'), {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </option>
                ))}
              </select>
            </Field>
            <ArrowRight size={20} />
            <Field label={t('latest')}>
              <select
                className="select"
                value={right.id}
                onChange={(e) => {
                  setRightId(e.target.value);
                  setLeftId('');
                }}
              >
                {snapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {projects.find((project) => project.id === snapshot.projectId)?.name} -{' '}
                    {snapshot.name} ·{' '}
                    {formatDate(snapshot.createdAt, t('dateLocale'), {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="table-wrap">
            <table className="data-table comparison-table">
              <thead>
                <tr>
                  <th>{t('metric')}</th>
                  <th>{t('baseline')}</th>
                  <th>{t('latest')}</th>
                  <th>{t('change')}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map(([key, label, unit, scale = 1]) => {
                  const a = number(left.metrics?.[key]) * scale,
                    b = number(right.metrics?.[key]) * scale,
                    delta = Math.round((b - a) * 10) / 10;
                  return (
                    <tr key={key}>
                      <td>{t(label)}</td>
                      <td>
                        {Math.round(a * 10) / 10}
                        {unit}
                      </td>
                      <td>
                        {Math.round(b * 10) / 10}
                        {unit}
                      </td>
                      <td
                        className={
                          delta === 0
                            ? 'muted'
                            : ['riskCount', 'averageRisk', 'overdueCount'].includes(key)
                              ? delta < 0
                                ? 'text-green'
                                : 'text-orange'
                              : 'text-purple'
                        }
                      >
                        {delta > 0 ? '+' : ''}
                        {delta}
                        {unit === '%' ? ` ${t('pp')}` : unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="comparison-placeholder">
          <div className="comparison-illustration">
            <Layers3 size={24} />
            <span />
            <Layers3 size={24} />
          </div>
          <p>{t('needTwoSnapshots')}</p>
        </div>
      )}
    </section>
  );
}
