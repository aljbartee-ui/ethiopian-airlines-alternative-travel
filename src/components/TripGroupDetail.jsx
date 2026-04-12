import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';

const EMPTY_SLOT = {
  vehicle_type: 'VAN',
  total_seats: '',
  bag_limit_per_pax: '',
  bag_limit_note: '',
  per_pax_cost_kwd: '',
  total_vehicle_price_kwd: '',
  pricing_mode: 'per_pax',
  pickup_location_url: '',
  pickup_time: '',
  departure_time: '',
  alsawan_note: ''
};

const EMPTY_PAX = {
  name: '', pnr: '', ticket_number: '',
  pax_count: 1, bags_count: '', visa_status: 'NOT_APPLIED',
  payment_status: 'AWAITING_FINAL_COST', car_slot_id: ''
};

function slotStatusBadge(s) {
  const map = {
    OPEN:      { cls: 'badge badge-open',       label: '● Open' },
    FULL:      { cls: 'badge badge-closed',      label: '⊘ Full' },
    COMPLETED: { cls: 'badge badge-confirmed',   label: '✓ Completed' },
    CANCELLED: { cls: 'badge badge-feasible',    label: '✕ Cancelled' },
  };
  const b = map[s] || map.OPEN;
  return <span className={b.cls}>{b.label}</span>;
}

function getCardGlowClass(slot) {
  if (slot.status === 'COMPLETED') return 'vehicle-card completed';
  if (slot.status === 'FULL') return 'vehicle-card full';
  const pct = slot.total_seats > 0 ? slot.booked_pax / slot.total_seats : 0;
  if (pct >= 0.8) return 'vehicle-card near-full';
  return 'vehicle-card';
}

function visaBadge(v) {
  const map = {
    NOT_APPLIED: { cls: 'badge badge-collecting', label: 'Not Applied' },
    IN_PROCESS:  { cls: 'badge badge-open',        label: 'In Process' },
    APPROVED:    { cls: 'badge badge-confirmed',   label: 'Approved' },
  };
  const b = map[v] || map.NOT_APPLIED;
  return <span className={b.cls}>{b.label}</span>;
}

function paymentBadge(s) {
  const map = {
    PAID:                { cls: 'badge badge-confirmed',  label: '✓ Paid' },
    ADVISED_TO_PAY:      { cls: 'badge badge-open',       label: '⚠ Advised to Pay' },
    AWAITING_FINAL_COST: { cls: 'badge badge-collecting', label: '⏳ Awaiting Final Cost' },
  };
  const b = map[s] || map.AWAITING_FINAL_COST;
  return <span className={b.cls}>{b.label}</span>;
}

export function TripGroupDetail({ role, tripGroup, onClose, onUpdated }) {
  const [carSlots, setCarSlots] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [editingSlot, setEditingSlot] = useState(null);
  const [slotForm, setSlotForm] = useState(EMPTY_SLOT);
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [editingPax, setEditingPax] = useState(null);
  const [paxForm, setPaxForm] = useState(EMPTY_PAX);
  const [showPaxForm, setShowPaxForm] = useState(false);
  const [savingSlot, setSavingSlot] = useState(false);
  const [savingPax, setSavingPax] = useState(false);
  const [slotError, setSlotError] = useState('');
  const [paxError, setPaxError] = useState('');
  const [fullAlert, setFullAlert] = useState(null);

  const loadCarSlots = useCallback(async () => {
    const data = await api(`/api/trip-groups/${tripGroup.id}/car-slots`);
    setCarSlots(data);
  }, [tripGroup.id]);

  const loadPassengers = useCallback(async () => {
    const data = await api(`/api/trip-groups/${tripGroup.id}/passengers`);
    setPassengers(data);
  }, [tripGroup.id]);

  useEffect(() => {
    loadCarSlots();
    loadPassengers();
  }, [loadCarSlots, loadPassengers]);

  const handleLiveUpdate = useCallback(() => {
    loadCarSlots();
    loadPassengers();
    onUpdated && onUpdated();
  }, [loadCarSlots, loadPassengers, onUpdated]);

  const handleSlotFull = useCallback((data) => {
    if (data.trip_group_id === tripGroup.id && data.action === 'full') {
      setFullAlert(`Vehicle is now FULL. Please request a new vehicle from Alsawan or choose another available one.`);
      setTimeout(() => setFullAlert(null), 8000);
    }
    loadCarSlots();
    onUpdated && onUpdated();
  }, [tripGroup.id, loadCarSlots, onUpdated]);

  useSSE({
    'car-slots-changed': handleSlotFull,
    'passengers-changed': handleLiveUpdate,
    'trip-groups-changed': handleLiveUpdate
  });

  // ── Car Slot form ────────────────────────────────────────────────────────────
  function handleSlotChange(e) {
    setSlotForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSlotSubmit(e) {
    e.preventDefault();
    setSlotError('');
    setSavingSlot(true);
    try {
      const payload = {
        ...slotForm,
        total_seats: Number(slotForm.total_seats),
        bag_limit_per_pax: slotForm.bag_limit_per_pax ? Number(slotForm.bag_limit_per_pax) : null,
        per_pax_cost_kwd: slotForm.pricing_mode === 'per_pax' && slotForm.per_pax_cost_kwd ? Number(slotForm.per_pax_cost_kwd) : null,
        total_vehicle_price_kwd: slotForm.pricing_mode === 'total' && slotForm.total_vehicle_price_kwd ? Number(slotForm.total_vehicle_price_kwd) : null,
        pickup_location_url: slotForm.pickup_location_url || null,
        pickup_time: slotForm.pickup_time || null,
        departure_time: slotForm.departure_time || null,
        alsawan_note: slotForm.alsawan_note || null
      };
      delete payload.pricing_mode;
      if (editingSlot) {
        await api(`/api/car-slots/${editingSlot.id}`, { method: 'PUT', body: JSON.stringify({ ...payload, status: editingSlot.status || 'OPEN' }) });
      } else {
        await api(`/api/trip-groups/${tripGroup.id}/car-slots`, { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowSlotForm(false);
      setEditingSlot(null);
      setSlotForm(EMPTY_SLOT);
    } catch (err) {
      setSlotError(err.message);
    } finally {
      setSavingSlot(false);
    }
  }

  async function handleSlotDelete(id) {
    if (!window.confirm('Remove this vehicle slot?')) return;
    await api(`/api/car-slots/${id}`, { method: 'DELETE' });
  }

  async function handleSlotStatusToggle(slot) {
    const newStatus = slot.status === 'FULL' ? 'OPEN' : 'FULL';
    await api(`/api/car-slots/${slot.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...slot, status: newStatus })
    });
  }

  // ── Passenger form ───────────────────────────────────────────────────────────
  function handlePaxChange(e) {
    setPaxForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handlePaxSubmit(e) {
    e.preventDefault();
    setPaxError('');
    setSavingPax(true);
    try {
      const payload = {
        ...paxForm,
        pax_count: Number(paxForm.pax_count || 1),
        bags_count: paxForm.bags_count !== '' ? Number(paxForm.bags_count) : null,
        car_slot_id: paxForm.car_slot_id ? Number(paxForm.car_slot_id) : null
      };
      if (editingPax) {
        await api(`/api/passengers/${editingPax.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api(`/api/trip-groups/${tripGroup.id}/passengers`, { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowPaxForm(false);
      setEditingPax(null);
      setPaxForm(EMPTY_PAX);
    } catch (err) {
      setPaxError(err.message);
    } finally {
      setSavingPax(false);
    }
  }

  async function handlePaxDelete(id) {
    if (!window.confirm('Delete this passenger entry?')) return;
    await api(`/api/passengers/${id}`, { method: 'DELETE' });
  }

  const openSlots = carSlots.filter(s => s.status === 'OPEN');

  return (
    <div className="detail-panel">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
            {tripGroup.transit_date?.slice(0,10)} — {tripGroup.transit_city}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>{tripGroup.direction}</span>
            <span>✈ {tripGroup.et_flight_number || '—'}</span>
            <span>→ {tripGroup.destination || '—'}</span>
            {(tripGroup.checkin_date || tripGroup.checkin_time) && (
              <span style={{ color: 'var(--warning)' }}>
                🕐 Check-in: {tripGroup.checkin_date?.slice(0,10)} {tripGroup.checkin_time?.slice(0,5)}
              </span>
            )}
          </div>
        </div>
        <button className="button secondary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={onClose}>
          ✕ Close
        </button>
      </div>

      {/* Meta */}
      <div className="detail-meta" style={{ marginBottom: 16 }}>
        {tripGroup.requested_pax && (
          <div className="detail-meta-item">
            <span className="detail-meta-label">Requested Pax</span>
            <span className="detail-meta-value">{tripGroup.requested_pax}</span>
          </div>
        )}
        {tripGroup.requester_pnr && (
          <div className="detail-meta-item">
            <span className="detail-meta-label">Requester PNR</span>
            <span className="detail-meta-value" style={{ fontFamily: 'monospace' }}>{tripGroup.requester_pnr}</span>
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

      {/* Full alert for ET */}
      {fullAlert && (
        <div style={{
          background: 'rgba(224,82,82,0.12)', border: '1px solid rgba(224,82,82,0.4)',
          color: '#f08080', borderRadius: 8, padding: '12px 16px',
          marginBottom: 16, fontSize: 13, fontWeight: 500
        }}>
          ⚠ {fullAlert}
        </div>
      )}

      {/* ── Car Slots Section ─────────────────────────────────────────────────── */}
      <div className="sub-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="sub-section-title" style={{ margin: 0 }}>🚌 Available Vehicles (Alsawan)</div>
          {role === 'ALSAWAN' && (
            <button className="button" style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => { setShowSlotForm(v => !v); setEditingSlot(null); setSlotForm({ ...EMPTY_SLOT }); setSlotError(''); }}>
              {showSlotForm ? '✕ Cancel' : '+ Add Vehicle'}
            </button>
          )}
        </div>

        {/* Alsawan: Add/Edit vehicle form */}
        {role === 'ALSAWAN' && showSlotForm && (
          <form onSubmit={handleSlotSubmit} style={{ marginBottom: 16 }}>
            <div className="form-row">
              <div className="form-field">
                <label className="label">Vehicle Type *</label>
                <select className="select" name="vehicle_type" value={slotForm.vehicle_type} onChange={handleSlotChange} required>
                  <option value="SEDAN">Sedan</option>
                  <option value="VAN">Van</option>
                  <option value="MINIBUS">Mini-bus</option>
                  <option value="BUS">Bus</option>
                </select>
              </div>
              <div className="form-field" style={{ flex: '0 1 120px' }}>
                <label className="label">Total Seats *</label>
                <input className="input" type="number" min="1" name="total_seats" value={slotForm.total_seats} onChange={handleSlotChange} required placeholder="e.g. 14" />
              </div>
              <div className="form-field" style={{ flex: '0 1 140px' }}>
                <label className="label">Bags/Pax Limit</label>
                <input className="input" type="number" min="0" name="bag_limit_per_pax" value={slotForm.bag_limit_per_pax} onChange={handleSlotChange} placeholder="e.g. 2" />
              </div>
              <div className="form-field">
                <label className="label">Bag Limit Note</label>
                <input className="input" name="bag_limit_note" value={slotForm.bag_limit_note} onChange={handleSlotChange} placeholder="e.g. 2PC 23kg + 7kg hand" />
              </div>
              <div className="form-field" style={{ flex: '0 1 170px' }}>
                <label className="label">Payment Type</label>
                <select className="select" value={slotForm.pricing_mode} onChange={e => {
                  const mode = e.target.value;
                  setSlotForm(p => ({ ...p, pricing_mode: mode, per_pax_cost_kwd: '', total_vehicle_price_kwd: '' }));
                }}>
                  <option value="per_pax">Cost per Pax</option>
                  <option value="total">Total Needed Payment</option>
                </select>
              </div>
              <div className="form-field" style={{ flex: '0 1 170px' }}>
                {slotForm.pricing_mode === 'per_pax' ? (
                  <>
                    <label className="label">Cost per Pax (KWD)</label>
                    <input className="input" name="per_pax_cost_kwd" value={slotForm.per_pax_cost_kwd} onChange={handleSlotChange} placeholder="e.g. 12.500" />
                  </>
                ) : (
                  <>
                    <label className="label">Total Payment (KWD)</label>
                    <input className="input" name="total_vehicle_price_kwd" value={slotForm.total_vehicle_price_kwd} onChange={handleSlotChange} placeholder="e.g. 150.000" />
                  </>
                )}
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label className="label">Pickup Location (URL, optional)</label>
                <input className="input" name="pickup_location_url" value={slotForm.pickup_location_url} onChange={handleSlotChange} placeholder="https://maps.google.com/..." />
              </div>
              <div className="form-field" style={{ flex: '0 1 140px' }}>
                <label className="label">Pickup Time</label>
                <input className="input" type="time" name="pickup_time" value={slotForm.pickup_time} onChange={handleSlotChange} />
              </div>
              <div className="form-field" style={{ flex: '0 1 140px' }}>
                <label className="label">Departure Time</label>
                <input className="input" type="time" name="departure_time" value={slotForm.departure_time} onChange={handleSlotChange} />
              </div>
            </div>
            <label className="label">Note (optional)</label>
            <textarea className="textarea" name="alsawan_note" value={slotForm.alsawan_note} onChange={handleSlotChange} rows={2} placeholder="Any notes for ET team…" />
            {slotError && <div className="error-box">{slotError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button" type="submit" disabled={savingSlot}>{savingSlot ? 'Saving…' : editingSlot ? '✓ Update Vehicle' : '✓ Add Vehicle'}</button>
              <button type="button" className="button ghost" onClick={() => { setShowSlotForm(false); setEditingSlot(null); }}>Cancel</button>
            </div>
          </form>
        )}

        {/* Car slots list */}
        {carSlots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: 13 }}>
            {role === 'ALSAWAN' ? 'No vehicles added yet — click "+ Add Vehicle" to post one.' : 'Alsawan has not posted any vehicles yet.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {carSlots.map(slot => (
              <div key={slot.id} className={getCardGlowClass(slot)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{slot.vehicle_type}</span>
                    {slotStatusBadge(slot.status)}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {slot.booked_pax}/{slot.total_seats} seats filled
                    </span>
                    {slot.total_vehicle_price_kwd && (() => {
                      const booked = Number(slot.booked_pax || 0);
                      const perPax = booked > 0 ? (Number(slot.total_vehicle_price_kwd) / booked).toFixed(3) : null;
                      return (
                        <span style={{ fontSize: 12, color: 'var(--et-gold-neon, var(--green-300))', fontWeight: 600 }}>
                          💰 {Number(slot.total_vehicle_price_kwd).toFixed(3)} KWD total
                          {perPax && <span style={{ color: 'var(--et-green-neon, var(--green-300))', marginLeft: 6 }}>({perPax} KWD/pax)</span>}
                        </span>
                      );
                    })()}
                    {!slot.total_vehicle_price_kwd && slot.per_pax_cost_kwd && (
                      <span style={{ fontSize: 12, color: 'var(--green-300)', fontWeight: 600 }}>
                        {slot.per_pax_cost_kwd} KWD/pax
                      </span>
                    )}
                  </div>
                  {role === 'ALSAWAN' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="button ghost" style={{ fontSize: 11, padding: '4px 10px' }}
                        onClick={() => {
                          setEditingSlot(slot);
                          setSlotForm({
                            vehicle_type: slot.vehicle_type || 'VAN',
                            total_seats: slot.total_seats || '',
                            bag_limit_per_pax: slot.bag_limit_per_pax || '',
                            bag_limit_note: slot.bag_limit_note || '',
                            per_pax_cost_kwd: slot.per_pax_cost_kwd || '',
                            total_vehicle_price_kwd: slot.total_vehicle_price_kwd || '',
                            pricing_mode: slot.total_vehicle_price_kwd ? 'total' : 'per_pax',
                            pickup_location_url: slot.pickup_location_url || '',
                            pickup_time: slot.pickup_time || '',
                            departure_time: slot.departure_time || '',
                            alsawan_note: slot.alsawan_note || ''
                          });
                          setShowSlotForm(true);
                          setSlotError('');
                        }}>Edit</button>
                      <button className="button ghost" style={{ fontSize: 11, padding: '4px 10px' }}
                        onClick={() => handleSlotStatusToggle(slot)}>
                        {slot.status === 'FULL' ? 'Re-open' : 'Mark Full'}
                      </button>
                      {(slot.status === 'FULL' || (slot.booked_pax >= slot.total_seats && slot.total_seats > 0)) && slot.status !== 'COMPLETED' && (
                        <button className="button complete" style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={async () => {
                            if (!window.confirm('Mark this vehicle as COMPLETED? This means it has departed.')) return;
                            await api(`/api/car-slots/${slot.id}`, { method: 'PUT', body: JSON.stringify({ ...slot, status: 'COMPLETED' }) });
                          }}>✓ Complete</button>
                      )}
                      <button className="button secondary" style={{ fontSize: 11, padding: '4px 10px' }}
                        onClick={() => handleSlotDelete(slot.id)}>Remove</button>
                    </div>
                  )}
                </div>

                {/* Slot details row */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                  {slot.bag_limit_per_pax && <span>🧳 {slot.bag_limit_per_pax} bags/pax</span>}
                  {slot.bag_limit_note && <span>📋 {slot.bag_limit_note}</span>}
                  {slot.pickup_time && <span>📍 Pickup: {slot.pickup_time.slice(0,5)}</span>}
                  {slot.departure_time && <span>🚀 Departs: {slot.departure_time.slice(0,5)}</span>}
                  {slot.pickup_location_url && (
                    <a href={slot.pickup_location_url} target="_blank" rel="noreferrer"
                      style={{ color: 'var(--green-300)', textDecoration: 'none' }}>
                      📌 View pickup location ↗
                    </a>
                  )}
                  {slot.alsawan_note && <span style={{ fontStyle: 'italic' }}>"{slot.alsawan_note}"</span>}
                </div>

                {/* Capacity bar */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                    <span>{slot.booked_pax} booked · {slot.remaining_seats} remaining · {slot.booked_bags} bags</span>
                    <span>{Math.round((slot.booked_pax / slot.total_seats) * 100)}% full</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${Math.min(Math.round((slot.booked_pax / slot.total_seats) * 100), 100)}%`,
                      background: slot.status === 'FULL' ? 'var(--danger)' :
                        slot.booked_pax / slot.total_seats >= 0.8 ? 'var(--warning)' : 'var(--green-400)',
                      transition: 'width 0.4s'
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Passengers Section (ET only) ─────────────────────────────────────── */}
      {role === 'ET' && (
        <div className="sub-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="sub-section-title" style={{ margin: 0 }}>👥 Passenger Entries</div>
            <button className="button" style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => { setShowPaxForm(v => !v); setEditingPax(null); setPaxForm(EMPTY_PAX); setPaxError(''); }}>
              {showPaxForm ? '✕ Cancel' : '+ Add Passenger'}
            </button>
          </div>

          {showPaxForm && (
            <form onSubmit={handlePaxSubmit} style={{ marginBottom: 16 }}>
              <div className="form-row">
                <div className="form-field">
                  <label className="label">Name (optional)</label>
                  <input className="input" name="name" value={paxForm.name} onChange={handlePaxChange} placeholder="Passenger name" />
                </div>
                <div className="form-field">
                  <label className="label">PNR</label>
                  <input className="input" name="pnr" value={paxForm.pnr} onChange={handlePaxChange} placeholder="e.g. ABC123" />
                </div>
                <div className="form-field">
                  <label className="label">Ticket Number</label>
                  <input className="input" name="ticket_number" value={paxForm.ticket_number} onChange={handlePaxChange} placeholder="e.g. 0711234567890" />
                </div>
                <div className="form-field" style={{ flex: '0 1 100px' }}>
                  <label className="label">Pax Count</label>
                  <input className="input" type="number" min="1" name="pax_count" value={paxForm.pax_count} onChange={handlePaxChange} />
                </div>
                <div className="form-field" style={{ flex: '0 1 100px' }}>
                  <label className="label">Bags</label>
                  <input className="input" type="number" min="0" name="bags_count" value={paxForm.bags_count} onChange={handlePaxChange} placeholder="0" />
                </div>
                <div className="form-field">
                  <label className="label">Visa Status</label>
                  <select className="select" name="visa_status" value={paxForm.visa_status} onChange={handlePaxChange}>
                    <option value="NOT_APPLIED">Not Applied</option>
                    <option value="IN_PROCESS">In Process</option>
                    <option value="APPROVED">Approved</option>
                  </select>
                </div>
                <div className="form-field">
                  <label className="label">Payment Status</label>
                  <select className="select" name="payment_status" value={paxForm.payment_status} onChange={handlePaxChange}>
                    <option value="AWAITING_FINAL_COST">Awaiting Final Cost</option>
                    <option value="ADVISED_TO_PAY">Advised to Pay</option>
                    <option value="PAID">Paid</option>
                  </select>
                </div>
              </div>

              {/* Assign to car slot */}
              <label className="label">Assign to Vehicle</label>
              <select className="select" name="car_slot_id" value={paxForm.car_slot_id} onChange={handlePaxChange}>
                <option value="">— Not assigned —</option>
                {carSlots.map(s => (
                  <option key={s.id} value={s.id} disabled={s.status === 'FULL' || s.status === 'CANCELLED'}>
                    {s.vehicle_type} — {s.remaining_seats} seats left
                    {s.total_vehicle_price_kwd ? ` · ${Number(s.total_vehicle_price_kwd).toFixed(3)} KWD total` : (s.per_pax_cost_kwd ? ` · ${s.per_pax_cost_kwd} KWD/pax` : '')}
                    {s.status !== 'OPEN' ? ` [${s.status}]` : ''}
                  </option>
                ))}
              </select>

              {openSlots.length === 0 && carSlots.length > 0 && (
                <div style={{ background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)', color: '#f08080', borderRadius: 6, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
                  ⚠ All vehicles are currently FULL. Please contact Alsawan to add more vehicles.
                </div>
              )}

              {paxError && <div className="error-box">{paxError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button" type="submit" disabled={savingPax}>{savingPax ? 'Saving…' : editingPax ? '✓ Update' : '+ Add'}</button>
                <button type="button" className="button ghost" onClick={() => { setShowPaxForm(false); setEditingPax(null); }}>Cancel</button>
              </div>
            </form>
          )}

          {passengers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: 13 }}>
              No passenger entries yet
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th><th>PNR</th><th>Ticket</th><th>Pax</th><th>Bags</th><th>Visa</th><th>Payment</th><th>Vehicle</th><th></th>
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
                      <td>{paymentBadge(p.payment_status)}</td>
                      <td style={{ fontSize: 12, color: p.car_vehicle_type ? 'var(--green-300)' : 'var(--text-dim)' }}>
                        {p.car_vehicle_type || 'Unassigned'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="button ghost" style={{ padding: '4px 10px', fontSize: 11 }}
                            onClick={() => {
                              setEditingPax(p);
                              setPaxForm({
                                name: p.name || '', pnr: p.pnr || '', ticket_number: p.ticket_number || '',
                                pax_count: p.pax_count || 1, bags_count: p.bags_count ?? '',
                                visa_status: p.visa_status || 'NOT_APPLIED',
                                payment_status: p.payment_status || 'AWAITING_FINAL_COST',
                                car_slot_id: p.car_slot_id || ''
                              });
                              setShowPaxForm(true);
                            }}>Edit</button>
                          <button className="button secondary" style={{ padding: '4px 10px', fontSize: 11 }}
                            onClick={() => handlePaxDelete(p.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Passenger summary for Alsawan ────────────────────────────────────── */}
      {role === 'ALSAWAN' && passengers.length > 0 && (
        <div className="sub-section">
          <div className="sub-section-title">👥 Passengers Added by ET</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th><th>PNR</th><th>Pax Count</th><th>Bags</th><th>Visa</th><th>Payment</th><th>Assigned Vehicle</th>
                </tr>
              </thead>
              <tbody>
                {passengers.map(p => (
                  <tr key={p.id}>
                    <td>{p.name || '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>{p.pnr || '—'}</td>
                    <td>{p.pax_count}</td>
                    <td>{p.bags_count ?? '—'}</td>
                    <td>{visaBadge(p.visa_status)}</td>
                    <td>{paymentBadge(p.payment_status)}</td>
                    <td style={{ fontSize: 12, color: p.car_vehicle_type ? 'var(--green-300)' : 'var(--text-dim)' }}>
                      {p.car_vehicle_type || 'Unassigned'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 20 }}>
            <span>Total passengers: <strong style={{ color: 'var(--text-main)' }}>{passengers.reduce((s, p) => s + p.pax_count, 0)}</strong></span>
            <span>Total bags: <strong style={{ color: 'var(--text-main)' }}>{passengers.reduce((s, p) => s + (p.bags_count || 0), 0)}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
