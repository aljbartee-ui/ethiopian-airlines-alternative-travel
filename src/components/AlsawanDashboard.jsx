import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';
import { TripGroupDetail } from './TripGroupDetail';

function transportBadge(s) {
  const map = {
    COLLECTING: 'badge badge-collecting',
    CONFIRMED: 'badge badge-confirmed',
    NOT_FEASIBLE: 'badge badge-feasible',
    COMPLETED: 'badge badge-completed',
  };
  return s ? <span className={map[s] || 'badge badge-collecting'}>{s}</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>;
}

export function AlsawanDashboard() {
  const [tripGroups, setTripGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [liveActive, setLiveActive] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/trip-groups');
      setTripGroups(data);
    } catch (e) {
      console.error('Failed to load trip groups', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLiveUpdate = useCallback(() => {
    setLiveActive(true);
    load().then(() => setTimeout(() => setLiveActive(false), 2000));
  }, [load]);

  useSSE({
    'trip-groups-changed': handleLiveUpdate,
    'passengers-changed': handleLiveUpdate,
    'transport-changed': handleLiveUpdate
  });

  return (
    <div>
      <div className="card">
        <div className="section-header">
          <div className="section-title">
            <div>
              <div className="card-title">Trip Groups</div>
              <div className="card-subtitle">View requests and set transport details for each group</div>
            </div>
            <span className={`live-dot ${liveActive ? 'active' : ''}`}>
              <span className="live-dot-circle" />
              LIVE
            </span>
          </div>
        </div>

        {tripGroups.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🚌</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No trip groups available</div>
            <div style={{ fontSize: 12 }}>Ethiopian Kuwait will add groups here</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>City</th>
                  <th>Direction</th>
                  <th>ET Flight</th>
                  <th>Destination</th>
                  <th>Req. Pax</th>
                  <th>Confirmed Pax</th>
                  <th>Transport</th>
                  <th>Cost (KWD)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tripGroups.map(tg => (
                  <tr key={tg.id}>
                    <td style={{ fontWeight: 500 }}>{tg.transit_date?.slice(0, 10)}</td>
                    <td>{tg.transit_city}</td>
                    <td>
                      <span style={{ fontSize: 11, color: tg.direction === 'OUTBOUND' ? 'var(--green-300)' : 'var(--warning)' }}>
                        {tg.direction === 'OUTBOUND' ? '↗ OUT' : '↙ IN'}
                      </span>
                    </td>
                    <td>{tg.et_flight_number || '—'}</td>
                    <td>{tg.destination || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{tg.requested_pax || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{tg.total_pax || 0}</td>
                    <td>{transportBadge(tg.transport_status)}</td>
                    <td>{tg.per_pax_cost_kwd ? `${tg.per_pax_cost_kwd} KWD` : '—'}</td>
                    <td>
                      <button className="button ghost" style={{ padding: '5px 12px', fontSize: 12 }}
                        onClick={() => setSelected(tg)}>
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
