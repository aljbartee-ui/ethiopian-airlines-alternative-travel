import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';
import { TripGroupDetail } from './TripGroupDetail';

export function AlsawanDashboard() {
  const [tripGroups, setTripGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [liveIndicator, setLiveIndicator] = useState(false);

  const load = useCallback(async () => {
    const data = await api('/api/trip-groups');
    setTripGroups(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleLiveUpdate = useCallback(() => {
    setLiveIndicator(true);
    load().then(() => setTimeout(() => setLiveIndicator(false), 1500));
  }, [load]);

  useSSE({
    'trip-groups-changed': handleLiveUpdate,
    'passengers-changed': handleLiveUpdate,
    'transport-changed': handleLiveUpdate
  });

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Alsawan – Trip Groups</h2>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, color: liveIndicator ? '#5e8f4d' : '#a0a0a0',
            transition: 'color 0.3s'
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: liveIndicator ? '#5e8f4d' : '#444',
              display: 'inline-block', transition: 'background 0.3s'
            }} />
            LIVE
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 0 }}>
          Select a date/city to set vehicle type, per‑pax cost in KWD, bag limits and status.
        </p>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th>City</th><th>Dir</th><th>ET flight</th>
              <th>Destination</th><th>Pax</th><th>Transport</th><th>Cost (KWD)</th><th></th>
            </tr>
          </thead>
          <tbody>
            {tripGroups.map(tg => (
              <tr key={tg.id}>
                <td>{tg.transit_date?.slice(0, 10)}</td>
                <td>{tg.transit_city}</td>
                <td>{tg.direction}</td>
                <td>{tg.et_flight_number || '-'}</td>
                <td>{tg.destination || '-'}</td>
                <td>{tg.total_pax || 0}</td>
                <td>{tg.transport_status || '-'}</td>
                <td>{tg.per_pax_cost_kwd || '-'}</td>
                <td>
                  <button className="button" onClick={() => setSelected(tg)}>Open</button>
                </td>
              </tr>
            ))}
            {tripGroups.length === 0 && (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No trip groups yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <TripGroupDetail
          role="ALSAWAN"
          tripGroup={selected}
          onClose={() => setSelected(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
