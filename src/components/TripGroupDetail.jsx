import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';

export function TripGroupDetail({ role, tripGroup, onClose, onUpdated }) {
  const [passengers, setPassengers] = useState([]);
  const [editingPassenger, setEditingPassenger] = useState(null);
  const [pForm, setPForm] = useState({
    name: '', pnr: '', ticket_number: '', pax_count: 1, bags_count: '', visa_status: 'NOT_APPLIED'
  });
  const [transport, setTransport] = useState({
    vehicle_type: '', per_pax_cost_kwd: '', bag_limit_text: '',
    transport_status: 'COLLECTING', alsawan_note: ''
  });
  const [savingPax, setSavingPax] = useState(false);
  const [savingTransport, setSavingTransport] = useState(false);

  const loadPassengers = useCallback(async () => {
    const data = await api(`/api/trip-groups/${tripGroup.id}/passengers`);
    setPassengers(data);
  }, [tripGroup.id]);

  const loadTransport = useCallback(async () => {
    const data = await api(`/api/trip-groups/${tripGroup.id}/transport`);
    if (data) {
      setTransport({
        vehicle_type: data.vehicle_type || '',
        per_pax_cost_kwd: data.per_pax_cost_kwd || '',
        bag_limit_text: data.bag_limit_text || '',
        transport_status: data.transport_status || 'COLLECTING',
        alsawan_note: data.alsawan_note || ''
      });
    }
  }, [tripGroup.id]);

  useEffect(() => {
    if (role === 'ET') loadPassengers();
    loadTransport();
  }, [tripGroup.id, role, loadPassengers, loadTransport]);

  useSSE({
    'passengers-changed': useCallback((data) => {
      if (data.trip_group_id === tripGroup.id && role === 'ET') {
        loadPassengers();
        onUpdated && onUpdated();
      }
    }, [tripGroup.id, role, loadPassengers, onUpdated]),
    'transport-changed': useCallback((data) => {
      if (data.trip_group_id === tripGroup.id) {
        loadTransport();
        onUpdated && onUpdated();
      }
    }, [tripGroup.id, loadTransport, onUpdated]),
    'trip-groups-changed': useCallback(() => {
      onUpdated && onUpdated();
    }, [onUpdated])
  });

  function handlePChange(e) {
    setPForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handlePassengerSubmit(e) {
    e.preventDefault();
    setSavingPax(true);
    try {
      const payload = {
        ...pForm,
        pax_count: Number(pForm.pax_count || 1),
        bags_count: pForm.bags_count !== '' ? Number(pForm.bags_count) : null
      };
      if (editingPassenger) {
        await api(`/api/passengers/${editingPassenger.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api(`/api/trip-groups/${tripGroup.id}/passengers`, { method: 'POST', body: JSON.stringify(payload) });
      }
      setPForm({ name: '', pnr: '', ticket_number: '', pax_count: 1, bags_count: '', visa_status: 'NOT_APPLIED' });
      setEditingPassenger(null);
    } finally {
      setSavingPax(false);
    }
  }

  async function handlePassengerDelete(id) {
    if (!window.confirm('Delete this passenger entry?')) return;
    await api(`/api/passengers/${id}`, { method: 'DELETE' });
  }

  function handleTransportChange(e) {
    setTransport(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleTransportSave(e) {
    e.preventDefault();
    setSavingTransport(true);
    try {
      const payload = {
        ...transport,
        per_pax_cost_kwd: transport.per_pax_cost_kwd !== '' ? Number(transport.per_pax_cost_kwd) : null
      };
      await api(`/api/trip-groups/${tripGroup.id}/transport`, { method: 'POST', body: JSON.stringify(payload) });
    } finally {
      setSavingTransport(false);
    }
  }

  function visaBadge(v) {
    const map = {
      NOT_APPLIED: { cls: 'badge badge-collecting', label: 'Not Applied' },
      IN_PROCESS:  { cls: 'badge badge-open',       label: 'In Process' },
      APPROVED:    { cls: 'badge badge-confirmed',   label: 'Approved' },
    };
    const b = map[v] || map.NOT_APPLIED;
    return <span className={b.cls}>{b.label}</span>;
  }

  return (
    <div className="detail-panel">
      {/* Panel header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
            {tripGroup.transit_date?.slice(0, 10)} — {tripGroup.transit_city}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {tripGroup.direction} &nbsp;·&nbsp; ET {tripGroup.et_flight_number || '—'} &nbsp;·&nbsp; {tripGroup.destination || '—'}
          </div>
        </div>
        <button className="button secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={onClose}>
          ✕ Close
        </button>
      </div>

      {/* Meta row */}
      <div className="detail-meta">
        {tripGroup.requested_pax && (
          <div className="detail-meta-item">
            <span className="detail-meta-label">Requested Pax</span>
            <span className="detail-meta-value">{tripGroup.requested_pax}</span>
          </div>
        )}
        {tripGroup.requester_pnr && (
          <div className="detail-meta-item">
            <span className="detail-meta-label">Requester PNR</span>
            <span className="detail-meta-value" style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{tripGroup.requester_pnr}</span>
          </div>
        )}
        {tripGroup.requester_ticket && (
          <div className="detail-meta-item">
            <span className="detail-meta-label">Requester Ticket</span>
            <span className="detail-meta-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{tripGroup.requester_ticket}</span>
          </div>
        )}
        {tripGroup.demand_note && (
          <div className="detail-meta-item" style={{ flex: '1 1 200px' }}>
            <span className="detail-meta-label">Demand Note</span>
            <span className="detail-meta-value" style={{ fontSize: 13 }}>{tripGroup.demand_note}</span>
          </div>
        )}
      </div>

      {/* Passenger section — ET only */}
      {role === 'ET' && (
        <div className="sub-section">
          <div className="sub-section-title">
            👥 Passenger Entries
          </div>

          <form onSubmit={handlePassengerSubmit}>
            <div className="form-row">
              <div className="form-field">
                <label className="label">Name (optional)</label>
                <input className="input" name="name" value={pForm.name} onChange={handlePChange} placeholder="Passenger name" />
              </div>
              <div className="form-field">
                <label className="label">PNR</label>
                <input className="input" name="pnr" value={pForm.pnr} onChange={handlePChange} placeholder="e.g. ABC123" />
              </div>
              <div className="form-field">
                <label className="label">Ticket Number</label>
                <input className="input" name="ticket_number" value={pForm.ticket_number} onChange={handlePChange} placeholder="e.g. 0711234567890" />
              </div>
              <div className="form-field" style={{ flex: '0 1 100px' }}>
                <label className="label">Pax Count</label>
                <input className="input" type="number" min="1" name="pax_count" value={pForm.pax_count} onChange={handlePChange} />
              </div>
              <div className="form-field" style={{ flex: '0 1 100px' }}>
                <label className="label">Bags</label>
                <input className="input" type="number" min="0" name="bags_count" value={pForm.bags_count} onChange={handlePChange} placeholder="0" />
              </div>
              <div className="form-field">
                <label className="label">Visa Status</label>
                <select className="select" name="visa_status" value={pForm.visa_status} onChange={handlePChange}>
                  <option value="NOT_APPLIED">Not Applied</option>
                  <option value="IN_PROCESS">In Process</option>
                  <option value="APPROVED">Approved</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button" type="submit" disabled={savingPax}>
                {savingPax ? 'Saving…' : editingPassenger ? '✓ Update Entry' : '+ Add Entry'}
              </button>
              {editingPassenger && (
                <button type="button" className="button ghost" onClick={() => {
                  setEditingPassenger(null);
                  setPForm({ name: '', pnr: '', ticket_number: '', pax_count: 1, bags_count: '', visa_status: 'NOT_APPLIED' });
                }}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          {passengers.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th><th>PNR</th><th>Ticket</th><th>Pax</th><th>Bags</th><th>Visa</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {passengers.map(p => (
                    <tr key={p.id}>
                      <td>{p.name || '—'}</td>
                      <td style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>{p.pnr || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.ticket_number || '—'}</td>
                      <td>{p.pax_count}</td>
                      <td>{p.bags_count ?? '—'}</td>
                      <td>{visaBadge(p.visa_status)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="button ghost" style={{ padding: '4px 10px', fontSize: 11 }}
                            onClick={() => {
                              setEditingPassenger(p);
                              setPForm({
                                name: p.name || '', pnr: p.pnr || '', ticket_number: p.ticket_number || '',
                                pax_count: p.pax_count || 1, bags_count: p.bags_count ?? '', visa_status: p.visa_status || 'NOT_APPLIED'
                              });
                            }}>Edit</button>
                          <button className="button secondary" style={{ padding: '4px 10px', fontSize: 11 }}
                            onClick={() => handlePassengerDelete(p.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {passengers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: 13 }}>
              No passenger entries yet — add the first one above
            </div>
          )}
        </div>
      )}

      {/* Transport section */}
      <div className="sub-section">
        <div className="sub-section-title">
          🚌 Transport Details (Alsawan)
        </div>

        <form onSubmit={handleTransportSave}>
          <div className="form-row">
            <div className="form-field">
              <label className="label">Vehicle Type</label>
              <select className="select" name="vehicle_type" value={transport.vehicle_type}
                onChange={handleTransportChange} disabled={role !== 'ALSAWAN'}>
                <option value="">Select vehicle</option>
                <option value="SEDAN">Sedan</option>
                <option value="VAN">Van</option>
                <option value="MINIBUS">Mini-bus</option>
                <option value="BUS">Bus</option>
              </select>
            </div>
            <div className="form-field" style={{ flex: '0 1 160px' }}>
              <label className="label">Per-Pax Cost (KWD)</label>
              <input className="input" name="per_pax_cost_kwd" value={transport.per_pax_cost_kwd}
                onChange={handleTransportChange} disabled={role !== 'ALSAWAN'} placeholder="e.g. 12.500" />
            </div>
            <div className="form-field">
              <label className="label">Bag Limit</label>
              <input className="input" name="bag_limit_text" value={transport.bag_limit_text}
                onChange={handleTransportChange} disabled={role !== 'ALSAWAN'}
                placeholder="e.g. 2PC 23kg + 7kg hand" />
            </div>
            <div className="form-field">
              <label className="label">Transport Status</label>
              <select className="select" name="transport_status" value={transport.transport_status}
                onChange={handleTransportChange} disabled={role !== 'ALSAWAN'}>
                <option value="COLLECTING">Collecting Pax</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="NOT_FEASIBLE">Not Feasible</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>
          <label className="label">Alsawan Note</label>
          <textarea className="textarea" name="alsawan_note" value={transport.alsawan_note}
            onChange={handleTransportChange} disabled={role !== 'ALSAWAN'} rows={2}
            placeholder="Any notes for Ethiopian Kuwait…" />
          {role === 'ALSAWAN' && (
            <button className="button" type="submit" disabled={savingTransport}>
              {savingTransport ? 'Saving…' : '✓ Save Transport Details'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
