import React, { useEffect, useState } from 'react';
import { api } from './api';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { EtDashboard } from './components/EtDashboard';
import { AlsawanDashboard } from './components/AlsawanDashboard';

export default function App() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    try {
      const data = await api('/api/me');
      setRole(data.role);
    } catch (e) {
      setRole(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function handleLogout() {
    await api('/api/logout', { method: 'POST' });
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
      {!role && <Login onLogin={setRole} />}
      {role === 'ET' && <EtDashboard />}
      {role === 'ALSAWAN' && <AlsawanDashboard />}
    </Layout>
  );
}
