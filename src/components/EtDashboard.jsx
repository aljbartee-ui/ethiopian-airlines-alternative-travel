import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';
import { TripGroupDetail } from './TripGroupDetail';

const EMPTY_FORM = {
  transit_city: 'RUH',
  transit_date: '',
  direction: 'OUTBOUND',
  et_flight_number: '',
  destination: '',
  checkin_date: '',
  checkin_time: '',
  requested_pax: '',
  requester_pnr: '',
  requester_ticket: '',
  status: 'OPEN',
  demand_note: ''
};

function statusBadge(s) {
  const map = {
    OPEN:      'badge badge-open',
    CLOSED:    'badge badge-closed',
    CONFIRMED: 'badge badge-confirmed',
  };
  return <span className={map[s] || 'badge badge-open'}>{s || 'OPEN'}</span>;
}

export function EtDashboard() {
  const [tripGroups, setTripGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveActive, setLiveActive] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

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

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('/api/trip-groups', {
        method: 'POST',
        body: JSON.stringify({
          transit_city: form.transit_city,
          transit_date: form.transit_date,
          direction: form.direction,
          et_flight_number: form.et_flight_number || null,
          destination: form.destination || null,
          checkin_date: form.checkin_date || null,
          checkin_time: form.checkin_time || null,
          requested_pax: form.requested_pax ? Number(form.requested_pax) : null,
          requester_pnr: form.requester_pnr || null,
          requester_ticket: form.requester_ticket || null,
          status: form.status || 'OPEN',
          demand_note: form.demand_note || null
        })
      });
      setCreating(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create trip group.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="card">
        <div className="section-header">
          <div className="section-title">
            <div>
              <div className="card-title">Trip Groups</div>
              <div className="card-subtitle">Create and manage Saudi transit coordination requests</div>
            </div>
            <span className={`live-dot ${liveActive ? 'active' : ''}`}>
              <span className="live-dot-circle" />
              LIVE
            </span>
          </div>
          <button className="button" onClick={() => { setCreating(v => !v); setError(''); }}>
            {creating ? '✕ Cancel' : '+ New Trip Group'}
          </button>
        </div>

        {creating && (
          <form onSubmit={handleCreate}>
            <hr className="divider" />

            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Flight Details
            </div>
            <div className="form-row">
              <div className="form-field">
                <label className="label">Transit City</label>
                <select className="select" name="transit_city" value={form.transit_city} onChange={handleChange}>
                  <option value="RUH">Riyadh (RUH)</option>
                  <option value="DMM">Dammam (DMM)</option>
                  <option value="JED">Jeddah (JED)</option>
                  <option value="MED">Medina (MED)</option>
                  <option value="GIZ">Jizan (GIZ)</option>
                </select>
              </div>
              <div className="form-field">
                <label className="label">Transit Date *</label>
                <input className="input" type="date" name="transit_date" value={form.transit_date} onChange={handleChange} required />
              </div>
              <div className="form-field">
                <label className="label">Direction</label>
                <select className="select" name="direction" value={form.direction} onChange={handleChange}>
                  <option value="OUTBOUND">Outbound (from KWI)</option>
                  <option value="INBOUND">Inbound (to KWI)</option>
                </select>
              </div>
              <div className="form-field">
                <label className="label">ET Flight No.</label>
                <input className="input" name="et_flight_number" value={form.et_flight_number} onChange={handleChange} placeholder="e.g. ET308" />
              </div>
              <div className="form-field">
                <label className="label">Destination</label>
                <input className="input" name="destination" value={form.destination} onChange={handleChange} placeholder="e.g. ADD / NBO" />
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Check-in Info
            </div>
            <div className="form-row">
              <div className="form-field">
                <label className="label">Check-in Date</label>
                <input className="input" type="date" name="checkin_date" value={form.checkin_date} onChange={handleChange} />
              </div>
              <div className="form-field">
                <label className="label">Check-in Time</label>
                <input className="input" type="time" name="checkin_time" value={form.checkin_time} onChange={handleChange} />
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Requester Info
            </div>
            <div className="form-row">
              <div className="form-field" style={{ flex: '0 1 160px' }}>
                <label className="label">Requested Pax</label>
                <input className="input" type="number" min="1" name="requested_pax" value={form.requested_pax} onChange={handleChange} placeholder="e.g. 4" />
              </div>
              <div className="form-field">
                <label className="label">Requester PNR</label>
                <input className="input" name="requester_pnr" value={form.requester_pnr} onChange={handleChange} placeholder="e.g. ABC123" />
              </div>
              <div className="form-field">
                <label className="label">Requester Ticket No.</label>
                <input className="input" name="requester_ticket" value={form.requester_ticket} onChange={handleChange} placeholder="e.g. 0711234567890" />
              </div>
              <div className="form-field" style={{ flex: '0 1 140px' }}>
                <label className="label">Status</label>
                <select className="select" name="status" value={form.status} onChange={handleChange}>
                  <option value="OPEN">Open</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
            </div>

            <label className="label">Demand Note (optional)</label>
            <textarea className="textarea" name="demand_note" value={form.demand_note} onChange={handleChange} rows={2} placeholder="Any special requirements…" />

            {error && <div className="error-box">{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : '✓ Save Trip Group'}</button>
              <button type="button" className="button ghost" onClick={() => { setCreating(false); setError(''); }}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      {/* Table */}
      <div className="card">
        {tripGroups.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✈</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No trip groups yet</div>
            <div style={{ fontSize: 12 }}>Click "New Trip Group" to create the first one</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th><th>City</th><th>Dir</th><th>Flight</th><th>Destination</th>
                  <th>Check-in</th><th>Req.Pax</th><th>Booked</th><th>Vehicles</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {tripGroups.map(tg => (
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
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--green-300)' }}>
                        {tg.car_slot_count || 0} vehicle{tg.car_slot_count !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td>{statusBadge(tg.status)}</td>
                    <td>
                      <button className="button ghost" style={{ padding: '5px 12px', fontSize: 12 }}
                        onClick={() => setSelected(tg)}>Open →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <TripGroupDetail role="ET" tripGroup={selected} onClose={() => setSelected(null)} onUpdated={load} />
      )}
    </div>
  );
}
