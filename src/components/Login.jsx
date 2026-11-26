import React, { useEffect, useState } from 'react';
import { Orbit, CheckCircle2, TrendingUp, Sparkles, AlertCircle, Zap } from 'lucide-react';
import { strings } from '../i18n.js';
import { api } from '../lib/api.js';
import { Field, Language } from './ui.jsx';

export function Login({ t, lang, setLang, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demoEnabled, setDemoEnabled] = useState(false);
  useEffect(() => {
    api('/config')
      .then((config) => setDemoEnabled(config.demoMode))
      .catch(() => {});
  }, []);
  async function login(event, demo = false) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', {
        method: 'POST',
        body: demo
          ? { email: 'demo@orbit.local', password: 'OrbitDemo2026!' }
          : { email, password },
      });
      await onLogin();
    } catch (err) {
      setError(t(err.status === 401 ? 'invalidLogin' : strings.en[err.code] ? err.code : 'error'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <a href="#" className="brand login-brand">
          <span className="brand-icon">
            <Orbit size={26} />
          </span>
          orbit<span className="brand-period">.</span>
        </a>
        <div className="login-copy">
          <span className="eyebrow">{t('loginEyebrow')}</span>
          <h1>
            {t('loginTitle')
              .split('\n')
              .map((line, i) => (
                <React.Fragment key={line}>
                  {i > 0 && <br />}
                  {line}
                </React.Fragment>
              ))}
          </h1>
          <p>{t('loginSubtitle')}</p>
        </div>
        <div className="login-orbit" aria-hidden="true">
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <div className="orbit-ring ring-three" />
          <span className="orbit-core">
            <Orbit size={66} strokeWidth={1.1} />
          </span>
          <span className="floating-chip chip-one">
            <CheckCircle2 size={17} /> {t('done')}
          </span>
          <span className="floating-chip chip-two">
            <TrendingUp size={17} /> RiskScore
          </span>
          <span className="orbit-dot dot-one" />
          <span className="orbit-dot dot-two" />
        </div>
        <div className="login-proof">
          <CheckCircle2 size={20} aria-hidden="true" />
          <span>{t('loginProof')}</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-language">
          <Language lang={lang} setLang={setLang} />
        </div>
        <div className="login-form">
          <span className="login-welcome-icon">
            <Sparkles size={24} />
          </span>
          <h2>
            {t('loginWelcome')}
            <span>.</span>
          </h2>
          <p>{t('loginHint')}</p>
          <form onSubmit={login}>
            <Field label={t('email')}>
              <input
                className="input"
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label={t('password')}>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && (
              <div className="error-message" role="alert">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            <button className="button primary login-submit" disabled={busy}>
              {busy ? <span className="spinner" /> : <>{t('signIn')}</>}
            </button>
          </form>
          {demoEnabled && (
            <>
              <div className="divider">
                <span>{t('or')}</span>
              </div>
              <button
                className="button secondary demo-button"
                disabled={busy}
                onClick={(event) => login(event, true)}
              >
                <Zap size={17} />
                {t('demoLogin')}
              </button>
              <p className="demo-hint">{t('demoHint')}</p>
            </>
          )}
        </div>
        <p className="login-footer">{t('loginFooter')}</p>
      </section>
    </main>
  );
}
