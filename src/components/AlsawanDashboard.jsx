import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { TripGroupDetail } from './TripGroupDetail';

export function AlsawanDashboard() {
  const [tripGroups, setTripGroups] = useState([]);
  const [selected, setSelected] = useState(null);

  async function load() {
    const data = await api('/api/trip-groups');
    setTripGroups(data);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Alsawan – Trip Groups</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Select a date/city to set vehicle type, per‑pax cost in KWD, bag limits and status.
        </p>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>City</th>
              <th>Dir</th>
              <th>ET flight</th>
              <th>Destination</th>
              <th>Pax</th>
              <th>Transport</th>
              <th>Cost (KWD)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tripGroups.map(tg => (
              <tr key={tg.id}>
                <td>{tg.transit_date}</td>
                <td>{tg.transit_city}</td>
                <td>{tg.direction}</td>
                <td>{tg.et_flight_number || '-'}</td>
                <td>{tg.destination || '-'}</td>
                <td>{tg.total_pax || 0}</td>
                <td>{tg.transport_status || '-'}</td>
                <td>{tg.per_pax_cost_kwd || '-'}</td>
                <td>
                  <button className="button" onClick={() => setSelected(tg)}>
                    Open
                  </button>
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
