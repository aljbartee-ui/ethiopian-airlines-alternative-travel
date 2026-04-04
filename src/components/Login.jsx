import React, { useState } from 'react';
import { api } from '../api';

export function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      onLogin(data.role);
    } catch (err) {
      setError(err.message || 'Invalid password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">ET</div>
        <div className="login-title">Internal Access</div>
        <div className="login-sub">
          Ethiopian Airlines Kuwait &amp; Alsawan Group<br />
          Saudi Transit Coordination Portal
        </div>

        <form onSubmit={handleSubmit}>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your team password"
            autoFocus
          />

          {error && <div className="error-box">{error}</div>}

          <button className="button" type="submit" disabled={loading || !password}
            style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: 14 }}>
            {loading ? 'Verifying…' : 'Login →'}
          </button>
        </form>

        <div style={{ marginTop: 20, padding: '12px', background: 'rgba(52,160,80,0.06)', borderRadius: 8, border: '1px solid rgba(52,160,80,0.15)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
            Use the password provided by your team administrator
          </div>
        </div>
      </div>
    </div>
  );
}
