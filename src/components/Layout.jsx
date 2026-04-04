import React from 'react';

export function Layout({ role, onLogout, children }) {
  return (
    <div className="app-root">
      <header className="header">
        <div className="header-logo">
          <div className="header-logo-icon">ET</div>
          <div>
            <div className="header-title">Ethiopian Airlines Kuwait</div>
            <div className="header-subtitle">Saudi Transit Coordination</div>
          </div>
        </div>

        {role && (
          <div className="header-right">
            <span className="role-badge">
              {role === 'ET' ? '✈ Ethiopian Kuwait' : '🚌 Alsawan Group'}
            </span>
            <button className="button secondary" onClick={onLogout} style={{ padding: '6px 12px', fontSize: 12 }}>
              Logout
            </button>
          </div>
        )}
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
