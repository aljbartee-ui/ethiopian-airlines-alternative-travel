import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';
import { TripGroupDetail } from './TripGroupDetail';

export function AlsawanDashboard() {
  const [tripGroups, setTripGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [liveActive, setLiveActive] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/trip-groups');
      setTripGroups(data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLiveUpdate = useCallback(() => {
    setLiveActive(true);
    load().then(() => setTimeout(() => setLiveActive(false), 2000));
  }, [load]);

  useSSE({
    'trip-groups-changed': handleLiveUpdate,
    'passengers-changed': handleLiveUpdate,
    'car-slots-changed': handleLiveUpdate
  });

  function fillRate(tg) {
    const seats = Number(tg.total_seats_available) || 0;
    const booked = Number(tg.total_pax) || 0;
    if (seats === 0) return null;
    return Math.round((booked / seats) * 100);
  }

  return (
    <div>
      <div className="card">
        <div className="section-header">
          <div className="section-title">
            <div>
              <div className="card-title">Trip Groups</div>
              <div className="card-subtitle">View ET requests and post available vehicles for each group</div>
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
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No trip groups yet</div>
            <div style={{ fontSize: 12 }}>Ethiopian Kuwait will add groups here</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th><th>City</th><th>Dir</th><th>Flight</th><th>Destination</th>
                  <th>Check-in</th><th>Req.Pax</th><th>Booked Pax</th><th>Total Bags</th>
                  <th>Your Vehicles</th><th>Fill Rate</th><th></th>
                </tr>
              </thead>
              <tbody>
                {tripGroups.map(tg => {
                  const rate = fillRate(tg);
                  return (
                    <tr key={tg.id}>
                      <td style={{ fontWeight: 500 }}>{tg.transit_date?.slice(0,10)}</td>
                      <td>{tg.transit_city}</td>
                      <td>
                        <span style={{ fontSize: 11, color: tg.direction === 'OUTBOUND' ? 'var(--green-300)' : 'var(--warning)' }}>
                          {tg.direction === 'OUTBOUND' ? '↗ OUT' : '↙ IN'}
                        </span>
                      </td>
                      <td>{tg.et_flight_number || '—'}</td>
                      <td>{tg.destination || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {tg.checkin_date ? tg.checkin_date.slice(0,10) : ''}
                        {tg.checkin_time ? ` ${tg.checkin_time.slice(0,5)}` : ''}
                        {!tg.checkin_date && !tg.checkin_time ? '—' : ''}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{tg.requested_pax || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{tg.total_pax || 0}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{tg.total_bags || 0}</td>
                      <td>
                        <span style={{ fontSize: 12, color: 'var(--green-300)' }}>
                          {tg.car_slot_count || 0} vehicle{tg.car_slot_count !== 1 ? 's' : ''}
                          {tg.total_seats_available > 0 && (
                            <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>
                              ({tg.total_seats_available} seats)
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        {rate !== null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, minWidth: 50 }}>
                              <div style={{
                                height: '100%', borderRadius: 3,
                                width: `${Math.min(rate, 100)}%`,
                                background: rate >= 100 ? 'var(--danger)' : rate >= 80 ? 'var(--warning)' : 'var(--green-400)'
                              }} />
                            </div>
                            <span style={{ fontSize: 11, color: rate >= 100 ? 'var(--danger)' : 'var(--text-muted)' }}>
                              {rate}%
                            </span>
                          </div>
                        ) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        <button className="button ghost" style={{ padding: '5px 12px', fontSize: 12 }}
                          onClick={() => setSelected(tg)}>Open →</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <TripGroupDetail role="ALSAWAN" tripGroup={selected} onClose={() => setSelected(null)} onUpdated={load} />
      )}
    </div>
  );
}
