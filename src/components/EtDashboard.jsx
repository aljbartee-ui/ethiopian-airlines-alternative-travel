import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { TripGroupDetail } from './TripGroupDetail';

export function EtDashboard() {
  const [tripGroups, setTripGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    transit_city: 'RUH',
    transit_date: '',
    direction: 'OUTBOUND',
    et_flight_number: '',
    destination: '',
    status: 'OPEN',
    demand_note: ''
  });

  async function load() {
    const data = await api('/api/trip-groups');
    setTripGroups(data);
  }

  useEffect(() => {
    load();
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleCreate(e) {
    e.preventDefault();
    const payload = { ...form };
    const created = await api('/api/trip-groups', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setCreating(false);
    setForm({
      transit_city: 'RUH',
      transit_date: '',
      direction: 'OUTBOUND',
      et_flight_number: '',
      destination: '',
      status: 'OPEN',
      demand_note: ''
    });
    setTripGroups(prev => [...prev, created]);
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Ethiopian Kuwait – Trip Groups</h2>
          <button className="button" onClick={() => setCreating(v => !v)}>
            {creating ? 'Cancel' : 'New Trip Group'}
          </button>
        </div>
        {creating && (
          <form onSubmit={handleCreate} style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <label className="label">Transit city</label>
                <select
                  className="select"
                  name="transit_city"
                  value={form.transit_city}
                  onChange={handleChange}
                >
                  <option value="RUH">Riyadh (RUH)</option>
                  <option value="DMM">Dammam (DMM)</option>
                  <option value="JED">Jeddah (JED)</option>
                  <option value="MED">Medina (MED)</option>
                  <option value="GIZ">Jizan (GIZ)</option>
                </select>
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label className="label">Transit date</label>
                <input
                  className="input"
                  type="date"
                  name="transit_date"
                  value={form.transit_date}
                  onChange={handleChange}
                  required
                />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label className="label">Direction</label>
                <select
                  className="select"
                  name="direction"
                  value={form.direction}
                  onChange={handleChange}
                >
                  <option value="OUTBOUND">Outbound (from KWI)</option>
                  <option value="INBOUND">Inbound (to KWI)</option>
                </select>
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label className="label">ET flight</label>
                <input
                  className="input"
                  name="et_flight_number"
                  value={form.et_flight_number}
                  onChange={handleChange}
                  placeholder="ET3xx"
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label className="label">Destination</label>
                <input
                  className="input"
                  name="destination"
                  value={form.destination}
                  onChange={handleChange}
                  placeholder="e.g. ADD / NBO"
                />
              </div>
            </div>
            <label className="label">Demand note (optional)</label>
            <textarea
              className="textarea"
              name="demand_note"
              value={form.demand_note}
              onChange={handleChange}
              rows={2}
            />
            <button className="button" type="submit">
              Save trip group
            </button>
          </form>
        )}
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
          role="ET"
          tripGroup={selected}
          onClose={() => setSelected(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
