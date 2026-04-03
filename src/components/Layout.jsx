import React from 'react';

export function Layout({ role, onLogout, children }) {
  return (
    <div className="app-root">
      <header className="header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="header-title">
            Ethiopian Airlines Kuwait – Saudi Transit Coordination
          </div>
          {role && (
            <div style={{ fontSize: 12 }}>
              <span style={{ marginRight: 12 }}>
                Role: {role === 'ET' ? 'Ethiopian Kuwait' : 'Alsawan Group'}
              </span>
              <button className="button secondary" onClick={onLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
