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
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '40px auto' }}>
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Internal Access</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Enter the shared password for Ethiopian Kuwait or Alsawan Group.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
          />
          {error && (
            <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 10, padding: '8px', background: 'rgba(255,107,107,0.1)', borderRadius: 4 }}>
              {error}
            </div>
          )}
          <button className="button" type="submit" disabled={loading || !password}>
            {loading ? 'Checking…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
