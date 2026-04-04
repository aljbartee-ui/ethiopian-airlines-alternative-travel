import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';

export function TripGroupDetail({ role, tripGroup, onClose, onUpdated }) {
  const [passengers, setPassengers] = useState([]);
  const [pForm, setPForm] = useState({
    name: '', pnr: '', ticket_number: '', pax_count: 1, bags_count: '', visa_status: 'NOT_APPLIED'
  });
  const [editingPassenger, setEditingPassenger] = useState(null);

  const [transport, setTransport] = useState({
    vehicle_type: '', per_pax_cost_kwd: '', bag_limit_text: '',
    transport_status: 'COLLECTING', alsawan_note: ''
  });

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

  // Live updates: reload when someone else changes this trip group's data
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
    setPForm({ ...pForm, [e.target.name]: e.target.value });
  }

  async function handlePassengerSubmit(e) {
    e.preventDefault();
    const payload = {
      ...pForm,
      pax_count: Number(pForm.pax_count || 1),
      bags_count: pForm.bags_count ? Number(pForm.bags_count) : null
    };

    if (editingPassenger) {
      await api(`/api/passengers/${editingPassenger.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api(`/api/trip-groups/${tripGroup.id}/passengers`, { method: 'POST', body: JSON.stringify(payload) });
    }

    setPForm({ name: '', pnr: '', ticket_number: '', pax_count: 1, bags_count: '', visa_status: 'NOT_APPLIED' });
    setEditingPassenger(null);
    // SSE will trigger reload for everyone
  }

  async function handlePassengerDelete(id) {
    if (!window.confirm('Delete this passenger entry?')) return;
    await api(`/api/passengers/${id}`, { method: 'DELETE' });
    // SSE will trigger reload
  }

  function handleTransportChange(e) {
    setTransport({ ...transport, [e.target.name]: e.target.value });
  }

  async function handleTransportSave(e) {
    e.preventDefault();
    const payload = {
      ...transport,
      per_pax_cost_kwd: transport.per_pax_cost_kwd ? Number(transport.per_pax_cost_kwd) : null
    };
    await api(`/api/trip-groups/${tripGroup.id}/transport`, { method: 'POST', body: JSON.stringify(payload) });
    // SSE will trigger reload for everyone
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>
          {tripGroup.transit_date?.slice(0, 10)} – {tripGroup.transit_city} – {tripGroup.direction}
        </h3>
        <button className="button secondary" onClick={onClose}>Close</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        ET flight: {tripGroup.et_flight_number || '-'} | Destination: {tripGroup.destination || '-'}
      </p>

      {role === 'ET' && (
        <div style={{ marginTop: 16 }}>
          <h4>Passengers (PNR / ticket entries)</h4>
          <form onSubmit={handlePassengerSubmit}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ flex: '1 1 140px' }}>
                <label className="label">Name (optional)</label>
                <input className="input" name="name" value={pForm.name} onChange={handlePChange} />
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <label className="label">PNR</label>
                <input className="input" name="pnr" value={pForm.pnr} onChange={handlePChange} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label className="label">Ticket number</label>
                <input className="input" name="ticket_number" value={pForm.ticket_number} onChange={handlePChange} />
              </div>
              <div style={{ flex: '1 1 80px' }}>
                <label className="label">Pax count</label>
                <input className="input" type="number" min="1" name="pax_count" value={pForm.pax_count} onChange={handlePChange} />
              </div>
              <div style={{ flex: '1 1 80px' }}>
                <label className="label">Bags</label>
                <input className="input" type="number" min="0" name="bags_count" value={pForm.bags_count} onChange={handlePChange} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label className="label">Visa status</label>
                <select className="select" name="visa_status" value={pForm.visa_status} onChange={handlePChange}>
                  <option value="NOT_APPLIED">Not applied</option>
                  <option value="IN_PROCESS">In process</option>
                  <option value="APPROVED">Approved</option>
                </select>
              </div>
            </div>
            <button className="button" type="submit" style={{ marginTop: 8 }}>
              {editingPassenger ? 'Update entry' : 'Add entry'}
            </button>
            {editingPassenger && (
              <button type="button" className="button secondary" style={{ marginLeft: 8 }}
                onClick={() => {
                  setEditingPassenger(null);
                  setPForm({ name: '', pnr: '', ticket_number: '', pax_count: 1, bags_count: '', visa_status: 'NOT_APPLIED' });
                }}>
                Cancel edit
              </button>
            )}
          </form>

          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>PNR</th><th>Ticket</th><th>Pax</th><th>Bags</th><th>Visa</th><th></th></tr>
            </thead>
            <tbody>
              {passengers.map(p => (
                <tr key={p.id}>
                  <td>{p.pnr || '-'}</td>
                  <td>{p.ticket_number || '-'}</td>
                  <td>{p.pax_count}</td>
                  <td>{p.bags_count ?? '-'}</td>
                  <td>{p.visa_status}</td>
                  <td>
                    <button className="button" onClick={() => {
                      setEditingPassenger(p);
                      setPForm({
                        name: p.name || '', pnr: p.pnr || '', ticket_number: p.ticket_number || '',
                        pax_count: p.pax_count || 1, bags_count: p.bags_count ?? '', visa_status: p.visa_status || 'NOT_APPLIED'
                      });
                    }}>Edit</button>
                    <button className="button secondary" style={{ marginLeft: 4 }}
                      onClick={() => handlePassengerDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {passengers.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No passenger entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h4>Transport details (Alsawan)</h4>
        <form onSubmit={handleTransportSave}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '1 1 140px' }}>
              <label className="label">Vehicle type</label>
              <select className="select" name="vehicle_type" value={transport.vehicle_type}
                onChange={handleTransportChange} disabled={role !== 'ALSAWAN'}>
                <option value="">Select</option>
                <option value="SEDAN">Sedan</option>
                <option value="VAN">Van</option>
                <option value="MINIBUS">Mini‑bus</option>
                <option value="BUS">Bus</option>
              </select>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <label className="label">Per‑pax cost (KWD)</label>
              <input className="input" name="per_pax_cost_kwd" value={transport.per_pax_cost_kwd}
                onChange={handleTransportChange} disabled={role !== 'ALSAWAN'} />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label className="label">Bag limit text</label>
              <input className="input" name="bag_limit_text" value={transport.bag_limit_text}
                onChange={handleTransportChange} disabled={role !== 'ALSAWAN'}
                placeholder="e.g. 2PC 23kg + 7kg hand" />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label className="label">Transport status</label>
              <select className="select" name="transport_status" value={transport.transport_status}
                onChange={handleTransportChange} disabled={role !== 'ALSAWAN'}>
                <option value="COLLECTING">Collecting pax</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="NOT_FEASIBLE">Not feasible</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>
          <label className="label">Alsawan note</label>
          <textarea className="textarea" name="alsawan_note" value={transport.alsawan_note}
            onChange={handleTransportChange} disabled={role !== 'ALSAWAN'} rows={2} />
          {role === 'ALSAWAN' && (
            <button className="button" type="submit">Save transport details</button>
          )}
        </form>
      </div>
    </div>
  );
}
