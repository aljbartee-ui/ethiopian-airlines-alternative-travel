import React, { useEffect, useState } from 'react';
import { api, getStoredRole, setStoredRole } from './api';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { EtDashboard } from './components/EtDashboard';
import { AlsawanDashboard } from './components/AlsawanDashboard';

export default function App() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount, restore role from localStorage immediately (no network call needed)
    const stored = getStoredRole();
    setRole(stored);
    setLoading(false);
  }, []);

  function handleLogin(newRole) {
    setStoredRole(newRole);
    setRole(newRole);
  }

  async function handleLogout() {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (e) {
      // ignore logout errors
    }
    setStoredRole(null);
    setRole(null);
  }

  if (loading) {
    return (
      <Layout role={null} onLogout={handleLogout}>
        <div style={{ textAlign: 'center', marginTop: 40 }}>Loading…</div>
      </Layout>
    );
  }

  return (
    <Layout role={role} onLogout={handleLogout}>
      {!role && <Login onLogin={handleLogin} />}
      {role === 'ET' && <EtDashboard />}
      {role === 'ALSAWAN' && <AlsawanDashboard />}
    </Layout>
  );
}
