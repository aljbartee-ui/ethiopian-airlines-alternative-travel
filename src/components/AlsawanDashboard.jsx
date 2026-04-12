import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';
import { TripGroupDetail } from './TripGroupDetail';

/* ── helpers ─────────────────────────────────────────────────────────────── */
const fmtDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
};
const fmtTime = t => t ? t.slice(0,5) : '—';

const AIRPORTS = ['JED','DMM','RUH','MED','GIZ'];

const EMPTY_CAR = {
  trip_group_id:'', vehicle_type:'BUS', total_seats:'',
  bag_limit_per_pax:'', bag_limit_note:'',
  per_pax_cost_kwd:'', total_vehicle_price_kwd:'',
  pricing_mode:'per_pax',
  pickup_location_url:'',
  pickup_time:'', departure_time:'',
  service_date:'', transit_city:'', transit_city_other:'',
  alsawan_note:''
};

const EMPTY_PAX = { name:'', pnr:'', ticket_number:'', pax_count:1, bags_count:'', visa_status:'NOT_APPLIED' };

function glowClass(slot) {
  if (slot.status === 'COMPLETED') return 'vehicle-card completed';
  if (slot.status === 'FULL') return 'vehicle-card full';
  const pct = slot.total_seats > 0 ? slot.booked_pax / slot.total_seats : 0;
  if (pct >= 0.8) return 'vehicle-card near-full';
  return 'vehicle-card';
}

function StatusBadge({ s }) {
  const map = {
    OPEN:      ['badge badge-open',      '● Open'],
    FULL:      ['badge badge-closed',    '⊘ Full'],
    COMPLETED: ['badge badge-confirmed', '✓ Completed'],
    CANCELLED: ['badge badge-feasible',  '✕ Cancelled'],
  };
  const [cls, label] = map[s] || map.OPEN;
  return <span className={cls}>{label}</span>;
}

function VisaBadge({ v }) {
  const map = {
    NOT_APPLIED: ['badge badge-collecting','Not Applied'],
    IN_PROCESS:  ['badge badge-open',      'In Process'],
    APPROVED:    ['badge badge-confirmed', 'Approved'],
  };
  const [cls, label] = map[v] || map.NOT_APPLIED;
  return <span className={cls}>{label}</span>;
}

function PaymentBadge({ s }) {
  const map = {
    PAID:                ['badge badge-confirmed',  '✓ Paid'],
    ADVISED_TO_PAY:      ['badge badge-open',       '⚠ Advised to Pay'],
    AWAITING_FINAL_COST: ['badge badge-collecting', '⏳ Awaiting Final Cost'],
  };
  const [cls, label] = map[s] || map.AWAITING_FINAL_COST;
  return <span className={cls}>{label}</span>;
}

/* ── main component ──────────────────────────────────────────────────────── */
export function AlsawanDashboard() {
  const [groups,       setGroups]       = useState([]);
  const [allSlots,     setAllSlots]     = useState([]);
  const [selected,     setSelected]     = useState(null);       // trip group detail
  const [selSlot,      setSelSlot]      = useState(null);       // standalone slot detail
  const [showCarForm,  setShowCarForm]  = useState(false);
  const [editCar,      setEditCar]      = useState(null);
  const [carForm,      setCarForm]      = useState(EMPTY_CAR);
  const [saving,       setSaving]       = useState(false);
  const [liveActive,   setLiveActive]   = useState(false);
  const [sseStatus,    setSseStatus]    = useState('connected'); // 'connected' | 'reconnecting'
  const [error,        setError]        = useState('');
  const [tab,          setTab]          = useState('groups');   // 'groups' | 'vehicles'

  /* slot detail state */
  const [slotPax,      setSlotPax]      = useState([]);
  const [showPaxForm,  setShowPaxForm]  = useState(false);
  const [paxForm,      setPaxForm]      = useState(EMPTY_PAX);
  const [savingPax,    setSavingPax]    = useState(false);
  const [paxError,     setPaxError]     = useState('');

  // Use ref to always have latest selSlot in SSE callback (avoids stale closure)
  const selSlotRef = useRef(null);
  useEffect(() => { selSlotRef.current = selSlot; }, [selSlot]);

  const loadGroups = useCallback(async () => {
    try { setGroups(await api('/api/trip-groups')); } catch(e){ console.error(e); }
  }, []);

  const loadSlots = useCallback(async () => {
    try {
      const slots = await api('/api/car-slots');
      setAllSlots(slots);
      // Also update selSlot with fresh data if it's open
      if (selSlotRef.current) {
        const updated = slots.find(s => s.id === selSlotRef.current.id);
        if (updated) setSelSlot(updated);
      }
    } catch(e){ console.error(e); }
  }, []);

  const loadSlotPax = useCallback(async (slotId) => {
    try { setSlotPax(await api(`/api/car-slots/${slotId}/passengers`)); } catch(e){ console.error(e); }
  }, []);

  useEffect(() => { loadGroups(); loadSlots(); }, [loadGroups, loadSlots]);

  // When a slot is selected, load its passengers
  useEffect(() => {
    if (selSlot) {
      loadSlotPax(selSlot.id);
    } else {
      setSlotPax([]);
    }
  }, [selSlot?.id, loadSlotPax]);

  // SSE live handler — always refreshes everything including open passenger panel
  const handleLive = useCallback(() => {
    setLiveActive(true);
    const currentSlot = selSlotRef.current;
    Promise.all([
      loadGroups(),
      loadSlots(),
      currentSlot ? loadSlotPax(currentSlot.id) : Promise.resolve()
    ]).then(() => {
      setTimeout(() => setLiveActive(false), 2000);
    });
  }, [loadGroups, loadSlots, loadSlotPax]);

  useSSE(
    {
      'trip-groups-changed': handleLive,
      'passengers-changed':  handleLive,
      'car-slots-changed':   handleLive
    },
    setSseStatus
  );

  /* ── car form ─────────────────────────────────────────────────────────── */
  const cf = (k, v) => setCarForm(p => ({ ...p, [k]: v }));

  const openAddCar = (groupId = '') => {
    setEditCar(null);
    setCarForm({ ...EMPTY_CAR, trip_group_id: groupId });
    setError(''); setShowCarForm(true);
  };

  const handleCarSubmit = async e => {
    e.preventDefault();
    if (!carForm.total_seats || Number(carForm.total_seats) < 1) { setError('Total seats is required'); return; }
    setSaving(true); setError('');
    try {
      const city = carForm.transit_city === 'OTHER' ? carForm.transit_city_other : carForm.transit_city;
      const body = {
        ...carForm,
        transit_city:             city || null,
        total_seats:              Number(carForm.total_seats),
        bag_limit_per_pax:        carForm.bag_limit_per_pax        ? Number(carForm.bag_limit_per_pax)        : null,
        per_pax_cost_kwd:         carForm.pricing_mode === 'per_pax' && carForm.per_pax_cost_kwd  ? Number(carForm.per_pax_cost_kwd)  : null,
        total_vehicle_price_kwd:  carForm.pricing_mode === 'total'  && carForm.total_vehicle_price_kwd ? Number(carForm.total_vehicle_price_kwd) : null,
        trip_group_id:            carForm.trip_group_id            || null,
        pickup_location_url:      carForm.pickup_location_url      || null,
        pickup_time:              carForm.pickup_time              || null,
        departure_time:           carForm.departure_time           || null,
        service_date:             carForm.service_date             || null,
        bag_limit_note:           carForm.bag_limit_note           || null,
        alsawan_note:             carForm.alsawan_note             || null,
      };
      delete body.pricing_mode;
      if (editCar) {
        await api(`/api/car-slots/${editCar.id}`, { method:'PUT', body: JSON.stringify({ ...body, status: editCar.status || 'OPEN' }) });
      } else if (body.trip_group_id) {
        await api(`/api/trip-groups/${body.trip_group_id}/car-slots`, { method:'POST', body: JSON.stringify(body) });
      } else {
        await api('/api/car-slots', { method:'POST', body: JSON.stringify(body) });
      }
      setShowCarForm(false);
      await Promise.all([loadGroups(), loadSlots()]);
    } catch (err) { setError(err.message || 'Failed to save vehicle'); }
    finally { setSaving(false); }
  };

  const handleSlotStatusToggle = async slot => {
    const newStatus = slot.status === 'FULL' ? 'OPEN' : 'FULL';
    await api(`/api/car-slots/${slot.id}`, { method:'PUT', body: JSON.stringify({ ...slot, status: newStatus }) });
    await loadSlots();
  };

  const handleSlotComplete = async slot => {
    if (!window.confirm('Mark this vehicle as COMPLETED? This means it has departed.')) return;
    await api(`/api/car-slots/${slot.id}`, { method:'PUT', body: JSON.stringify({ ...slot, status: 'COMPLETED' }) });
    await loadSlots();
  };

  const handleSlotDelete = async id => {
    if (!window.confirm('Remove this vehicle? All passengers in this vehicle will be unassigned.')) return;
    await api(`/api/car-slots/${id}`, { method:'DELETE' });
    await Promise.all([loadGroups(), loadSlots()]);
    if (selSlot?.id === id) { setSelSlot(null); setSlotPax([]); }
  };

  /* ── pax form ─────────────────────────────────────────────────────────── */
  const handlePaxSubmit = async e => {
    e.preventDefault();
    if (!selSlot) return;
    setSavingPax(true); setPaxError('');
    try {
      const body = { ...paxForm, pax_count: Number(paxForm.pax_count)||1, bags_count: paxForm.bags_count ? Number(paxForm.bags_count) : null };
      await api(`/api/car-slots/${selSlot.id}/passengers`, { method:'POST', body: JSON.stringify(body) });
      setPaxForm(EMPTY_PAX); setShowPaxForm(false);
      await loadSlotPax(selSlot.id);
      await loadSlots();
    } catch(err) { setPaxError(err.message || 'Failed to add passenger'); }
    finally { setSavingPax(false); }
  };

  const handlePaxDelete = async id => {
    if (!window.confirm('Remove this passenger?')) return;
    await api(`/api/passengers/${id}`, { method:'DELETE' });
    if (selSlot) await loadSlotPax(selSlot.id);
    await loadSlots();
  };

  /* ── derived stats ────────────────────────────────────────────────────── */
  const totalPax   = allSlots.reduce((s,sl) => s + Number(sl.booked_pax||0), 0);
  const totalBags  = allSlots.reduce((s,sl) => s + Number(sl.booked_bags||0), 0);
  const totalVeh   = allSlots.length;
  const standaloneSlots = allSlots.filter(s => !s.trip_group_id);

  /* ── render ───────────────────────────────────────────────────────────── */
  return (
    <div className="main">

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{groups.length}</div>
          <div className="stat-label">Trip Requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--et-gold-neon)',textShadow:'var(--glow-gold)'}}>{totalVeh}</div>
          <div className="stat-label">Vehicles Posted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalPax}</div>
          <div className="stat-label">Pax Booked</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--et-gold-neon)',textShadow:'var(--glow-gold)'}}>{totalBags}</div>
          <div className="stat-label">Total Bags</div>
        </div>
      </div>

      {/* Add Vehicle button */}
      <div className="card">
        <div className="section-header">
          <div className="section-title">
            <div>
              <div className="card-title">🚌 Vehicle Management</div>
              <div className="card-subtitle">Post vehicles linked to a trip group or standalone with a service date</div>
            </div>
            <span className={`live-dot${sseStatus==='reconnecting'?' reconnecting':liveActive?' active':''}`}>
              <span className="live-dot-circle" />
              {sseStatus === 'reconnecting' ? 'RECONNECTING…' : 'LIVE'}
            </span>
          </div>
          <button className="button gold" onClick={() => openAddCar('')}>+ Add Vehicle</button>
        </div>

        {showCarForm && (
          <div className="sub-section">
            <div className="sub-section-title">{editCar ? '✏ Edit Vehicle' : '+ New Vehicle'}</div>
            {error && <div className="error-box">⚠ {error}</div>}
            <form onSubmit={handleCarSubmit}>

              <div className="form-section-label">Link to Trip Group (optional — leave blank for standalone)</div>
              <div className="form-row">
                <div className="form-field" style={{flex:'2 1 260px'}}>
                  <label className="label">Trip Group</label>
                  <select className="select" value={carForm.trip_group_id} onChange={e => cf('trip_group_id', e.target.value)}>
                    <option value="">— Standalone (no group) —</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {fmtDate(g.transit_date)} · {g.transit_city} · {g.direction} · {g.et_flight_number || 'No flight'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label className="label">Service Date {!carForm.trip_group_id && <span style={{color:'var(--et-red-neon)'}}>*</span>}</label>
                  <input className="input" type="date" value={carForm.service_date} onChange={e => cf('service_date', e.target.value)}
                    required={!carForm.trip_group_id} />
                </div>
                <div className="form-field">
                  <label className="label">Transit City {!carForm.trip_group_id && <span style={{color:'var(--et-red-neon)'}}>*</span>}</label>
                  <select className="select" value={carForm.transit_city} onChange={e => cf('transit_city', e.target.value)}>
                    <option value="">— Select —</option>
                    {AIRPORTS.map(a => <option key={a} value={a}>{a}</option>)}
                    <option value="KWI">KWI – Kuwait</option>
                    <option value="DXB">DXB – Dubai</option>
                    <option value="DOH">DOH – Doha</option>
                    <option value="BAH">BAH – Bahrain</option>
                    <option value="MCT">MCT – Muscat</option>
                    <option value="AUH">AUH – Abu Dhabi</option>
                    <option value="OTHER">Other…</option>
                  </select>
                </div>
                {carForm.transit_city === 'OTHER' && (
                  <div className="form-field">
                    <label className="label">Airport Code / City</label>
                    <input className="input" placeholder="e.g. TIF" value={carForm.transit_city_other}
                      onChange={e => cf('transit_city_other', e.target.value)} required />
                  </div>
                )}
              </div>

              <div className="form-section-label">Vehicle Details</div>
              <div className="form-row">
                <div className="form-field">
                  <label className="label">Vehicle Type *</label>
                  <select className="select" value={carForm.vehicle_type} onChange={e => cf('vehicle_type', e.target.value)}>
                    <option value="BUS">Bus</option>
                    <option value="COASTER">Coaster</option>
                    <option value="MINIBUS">Minibus</option>
                    <option value="VAN">Van</option>
                    <option value="SUV">SUV</option>
                    <option value="SEDAN">Sedan</option>
                  </select>
                </div>
                <div className="form-field">
                  <label className="label">Total Seats *</label>
                  <input className="input" type="number" min="1" placeholder="e.g. 45" value={carForm.total_seats}
                    onChange={e => cf('total_seats', e.target.value)} required />
                </div>
                <div className="form-field">
                  <label className="label">Payment Type</label>
                  <select className="select" value={carForm.pricing_mode} onChange={e => {
                    const mode = e.target.value;
                    setCarForm(p => ({ ...p, pricing_mode: mode, per_pax_cost_kwd: '', total_vehicle_price_kwd: '' }));
                  }}>
                    <option value="per_pax">Cost per Pax</option>
                    <option value="total">Total Needed Payment</option>
                  </select>
                </div>
                <div className="form-field">
                  {carForm.pricing_mode === 'per_pax' ? (
                    <>
                      <label className="label">Cost per Pax (KWD)</label>
                      <input className="input" type="number" min="0" step="0.001" placeholder="e.g. 12.500"
                        value={carForm.per_pax_cost_kwd} onChange={e => cf('per_pax_cost_kwd', e.target.value)} />
                    </>
                  ) : (
                    <>
                      <label className="label">Total Needed Payment (KWD)</label>
                      <input className="input" type="number" min="0" step="0.001" placeholder="e.g. 150.000"
                        value={carForm.total_vehicle_price_kwd} onChange={e => cf('total_vehicle_price_kwd', e.target.value)} />
                    </>
                  )}
                </div>
              </div>

              <div className="form-section-label">Baggage Limits</div>
              <div className="form-row">
                <div className="form-field" style={{flex:'0 1 160px'}}>
                  <label className="label">Max Bags per Pax</label>
                  <input className="input" type="number" min="0" placeholder="e.g. 2"
                    value={carForm.bag_limit_per_pax} onChange={e => cf('bag_limit_per_pax', e.target.value)} />
                </div>
                <div className="form-field" style={{flex:'2 1 260px'}}>
                  <label className="label">Bag Limit Note</label>
                  <input className="input" placeholder="e.g. Max 23kg per bag, no oversize"
                    value={carForm.bag_limit_note} onChange={e => cf('bag_limit_note', e.target.value)} />
                </div>
              </div>

              <div className="form-section-label">Timing & Pickup</div>
              <div className="form-row">
                <div className="form-field">
                  <label className="label">Pickup Time</label>
                  <input className="input" type="time" value={carForm.pickup_time} onChange={e => cf('pickup_time', e.target.value)} />
                </div>
                <div className="form-field">
                  <label className="label">Departure Time</label>
                  <input className="input" type="time" value={carForm.departure_time} onChange={e => cf('departure_time', e.target.value)} />
                </div>
                <div className="form-field" style={{flex:'2 1 260px'}}>
                  <label className="label">Pickup Location Link (optional)</label>
                  <input className="input" type="url" placeholder="https://maps.google.com/..."
                    value={carForm.pickup_location_url} onChange={e => cf('pickup_location_url', e.target.value)} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field" style={{flex:'1 1 100%'}}>
                  <label className="label">Note for ET Team</label>
                  <input className="input" placeholder="Any note for ET team…"
                    value={carForm.alsawan_note} onChange={e => cf('alsawan_note', e.target.value)} />
                </div>
              </div>

              <div style={{display:'flex',gap:10,marginTop:4}}>
                <button className="button gold" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : editCar ? '✓ Update Vehicle' : '+ Add Vehicle'}
                </button>
                <button className="button ghost" type="button" onClick={() => setShowCarForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:8,marginBottom:4}}>
        <button className={`button${tab==='groups'?'':' ghost'}`} onClick={() => setTab('groups')}>📋 ET Trip Requests</button>
        <button className={`button${tab==='vehicles'?'':' ghost'}`} onClick={() => setTab('vehicles')}>
          🚌 All My Vehicles {standaloneSlots.length > 0 && <span className="badge badge-open" style={{marginLeft:6}}>{standaloneSlots.length} standalone</span>}
        </button>
      </div>

      {/* ── Tab: Trip Groups ─────────────────────────────────────────────── */}
      {tab === 'groups' && (
        <div className="card">
          {groups.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div style={{fontWeight:600,marginBottom:6}}>No trip groups yet</div>
              <div style={{fontSize:12}}>ET team will create requests here</div>
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th><th>City</th><th>Dir</th><th>Flight</th>
                    <th>Req Pax</th><th>Booked</th><th>Bags</th>
                    <th>Vehicles</th><th>Fill</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => {
                    const bookedPax  = Number(g.total_pax||0);
                    const totalSeats = Number(g.total_seats_available||0);
                    const fillPct    = totalSeats > 0 ? Math.min(100, Math.round(bookedPax/totalSeats*100)) : 0;
                    const barClass   = fillPct >= 90 ? 'high' : fillPct >= 60 ? 'medium' : 'low';
                    return (
                      <tr key={g.id} style={{cursor:'pointer'}} onClick={() => setSelected(selected?.id===g.id ? null : g)}>
                        <td style={{whiteSpace:'nowrap',fontWeight:500}}>{fmtDate(g.transit_date)}</td>
                        <td><strong style={{color:'var(--text-main)'}}>{g.transit_city}</strong></td>
                        <td>
                          <span style={{fontSize:11,fontWeight:700,color:g.direction==='OUTBOUND'?'var(--et-green-neon)':'var(--et-gold-neon)'}}>
                            {g.direction==='OUTBOUND'?'↑ OUT':'↓ IN'}
                          </span>
                        </td>
                        <td style={{color:'var(--et-green-neon)'}}>{g.et_flight_number||'—'}</td>
                        <td style={{color:'var(--et-gold-neon)',fontWeight:700}}>{g.requested_pax||'—'}</td>
                        <td style={{fontWeight:600}}>{bookedPax}</td>
                        <td style={{color:'var(--et-gold-neon)'}}>{Number(g.total_bags||0)}</td>
                        <td>{g.car_slot_count||0}</td>
                        <td style={{minWidth:110}}>
                          {totalSeats > 0 ? (
                            <div>
                              <div style={{fontSize:11,marginBottom:4,color:'var(--text-muted)'}}>{bookedPax}/{totalSeats} ({fillPct}%)</div>
                              <div className="capacity-bar-track">
                                <div className={`capacity-bar-fill ${barClass}`} style={{width:`${fillPct}%`}} />
                              </div>
                            </div>
                          ) : <span style={{color:'var(--text-dim)',fontSize:11}}>No vehicles</span>}
                        </td>
                        <td><span className={`badge ${g.status==='OPEN'?'badge-open':g.status==='CONFIRMED'?'badge-confirmed':'badge-feasible'}`}>{g.status||'OPEN'}</span></td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{display:'flex',gap:6}}>
                            <button className="button gold" style={{padding:'5px 10px',fontSize:11}} onClick={() => openAddCar(String(g.id))}>+ Vehicle</button>
                            <button className="button ghost" style={{padding:'5px 10px',fontSize:11}} onClick={() => setSelected(g)}>→ Detail</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: All Vehicles ────────────────────────────────────────────── */}
      {tab === 'vehicles' && (
        <div className="card">
          <div className="section-header" style={{marginBottom:14}}>
            <div>
              <div className="card-title">🚌 All Posted Vehicles</div>
              <div className="card-subtitle">Click any vehicle to expand and see passengers added by ET — updates live in real time</div>
            </div>
          </div>
          {allSlots.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🚌</div>
              <div style={{fontWeight:600,marginBottom:6}}>No vehicles posted yet</div>
              <div style={{fontSize:12}}>Click "+ Add Vehicle" above to post one</div>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {allSlots.map(slot => {
                const booked = Number(slot.booked_pax||0);
                const total  = Number(slot.total_seats||0);
                const pct    = total > 0 ? Math.min(100, Math.round(booked/total*100)) : 0;
                const isSelected = selSlot?.id === slot.id;
                return (
                  <div key={slot.id}>
                    <div className={glowClass(slot)} style={{cursor:'pointer'}} onClick={() => {
                      if (isSelected) {
                        setSelSlot(null);
                      } else {
                        setSelSlot(slot);
                        setShowPaxForm(false); setPaxForm(EMPTY_PAX); setPaxError('');
                      }
                    }}>
                      {/* Header row */}
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                          <span style={{fontWeight:700,fontSize:14}}>{slot.vehicle_type}</span>
                          <StatusBadge s={slot.status} />
                          {(slot.transit_city || slot.tg_transit_city) && (
                            <span style={{fontSize:12,background:'rgba(0,107,63,0.2)',border:'1px solid rgba(0,255,140,0.2)',borderRadius:4,padding:'2px 8px',color:'var(--et-green-neon)',fontWeight:600}}>
                              {slot.transit_city || slot.tg_transit_city}
                            </span>
                          )}
                          {slot.trip_group_id ? (
                            <span style={{fontSize:11,color:'var(--text-muted)'}}>
                              Group #{slot.trip_group_id}
                              {slot.tg_transit_date && ` · ${fmtDate(slot.tg_transit_date)}`}
                              {slot.et_flight_number && ` · ${slot.et_flight_number}`}
                            </span>
                          ) : (
                            <span style={{fontSize:11,background:'rgba(245,166,35,0.1)',border:'1px solid rgba(245,166,35,0.3)',borderRadius:4,padding:'2px 8px',color:'var(--et-gold-neon)'}}>Standalone</span>
                          )}
                          {slot.service_date && <span style={{fontSize:12,color:'var(--text-muted)'}}>📅 {fmtDate(slot.service_date)}</span>}
                          {slot.total_vehicle_price_kwd && (() => {
                            const perPax = booked > 0 ? (Number(slot.total_vehicle_price_kwd) / booked).toFixed(3) : null;
                            return (
                              <span style={{fontSize:12,color:'var(--et-gold-neon)',fontWeight:600}}>
                                💰 {Number(slot.total_vehicle_price_kwd).toFixed(3)} KWD total
                                {perPax && <span style={{color:'var(--et-green-neon)',marginLeft:6}}>({perPax} KWD/pax)</span>}
                              </span>
                            );
                          })()}
                          {!slot.total_vehicle_price_kwd && slot.per_pax_cost_kwd && <span style={{fontSize:12,color:'var(--et-green-neon)',fontWeight:600}}>{slot.per_pax_cost_kwd} KWD/pax</span>}
                        </div>
                        <div style={{display:'flex',gap:6}} onClick={e => e.stopPropagation()}>
                          <button className="button ghost" style={{fontSize:11,padding:'4px 10px'}} onClick={() => {
                            setEditCar(slot);
                            setCarForm({
                              trip_group_id:           slot.trip_group_id || '',
                              vehicle_type:            slot.vehicle_type || 'BUS',
                              total_seats:             slot.total_seats || '',
                              bag_limit_per_pax:       slot.bag_limit_per_pax || '',
                              bag_limit_note:          slot.bag_limit_note || '',
                              per_pax_cost_kwd:        slot.per_pax_cost_kwd || '',
                              total_vehicle_price_kwd: slot.total_vehicle_price_kwd || '',
                              pricing_mode:            slot.total_vehicle_price_kwd ? 'total' : 'per_pax',
                              pickup_location_url:     slot.pickup_location_url || '',
                              pickup_time:             slot.pickup_time ? slot.pickup_time.slice(0,5) : '',
                              departure_time:          slot.departure_time ? slot.departure_time.slice(0,5) : '',
                              service_date:            slot.service_date ? slot.service_date.slice(0,10) : '',
                              transit_city:            AIRPORTS.includes(slot.transit_city) ? slot.transit_city : (slot.transit_city ? 'OTHER' : ''),
                              transit_city_other:      AIRPORTS.includes(slot.transit_city) ? '' : (slot.transit_city || ''),
                              alsawan_note:            slot.alsawan_note || '',
                            });
                            setShowCarForm(true); setError('');
                          }}>✏ Edit</button>
                          <button className="button ghost" style={{fontSize:11,padding:'4px 10px'}} onClick={() => handleSlotStatusToggle(slot)}>
                            {slot.status === 'FULL' ? 'Re-open' : 'Mark Full'}
                          </button>
                          {(slot.status === 'FULL' || booked >= total) && slot.status !== 'COMPLETED' && (
                            <button className="button complete" style={{fontSize:11,padding:'4px 10px'}} onClick={() => handleSlotComplete(slot)}>✓ Complete</button>
                          )}
                          <button className="button secondary" style={{fontSize:11,padding:'4px 10px'}} onClick={() => handleSlotDelete(slot.id)}>🗑 Remove</button>
                        </div>
                      </div>

                      {/* Details row */}
                      <div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:8,fontSize:12,color:'var(--text-muted)'}}>
                        <span>🪑 {booked}/{total} seats</span>
                        {slot.bag_limit_per_pax != null && <span>🧳 Max {slot.bag_limit_per_pax} bags/pax</span>}
                        {slot.bag_limit_note && <span>📋 {slot.bag_limit_note}</span>}
                        {slot.pickup_time && <span>📍 Pickup: {fmtTime(slot.pickup_time)}</span>}
                        {slot.departure_time && <span>🚀 Departs: {fmtTime(slot.departure_time)}</span>}
                        {slot.pickup_location_url && (
                          <a href={slot.pickup_location_url} target="_blank" rel="noreferrer"
                            style={{color:'var(--et-green-neon)',textDecoration:'none'}} onClick={e => e.stopPropagation()}>
                            📌 Pickup location ↗
                          </a>
                        )}
                        {slot.alsawan_note && <span style={{color:'var(--et-gold-neon)'}}>💬 {slot.alsawan_note}</span>}
                      </div>

                      {/* Capacity bar */}
                      <div style={{marginTop:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-dim)',marginBottom:4}}>
                          <span>{booked} booked · {total - booked} remaining · {Number(slot.booked_bags||0)} bags total</span>
                          <span style={{fontWeight:600,color: pct>=100?'var(--et-red-neon)':pct>=80?'var(--warning)':'var(--et-green-neon)'}}>{pct}% full</span>
                        </div>
                        <div style={{height:6,background:'rgba(255,255,255,0.08)',borderRadius:3}}>
                          <div style={{
                            height:'100%',borderRadius:3,transition:'width 0.4s',
                            width:`${pct}%`,
                            background: slot.status==='FULL' ? 'var(--danger)' : pct>=80 ? 'var(--warning)' : 'var(--success)'
                          }} />
                        </div>
                      </div>

                      <div style={{marginTop:8,fontSize:12,color:'var(--text-dim)'}}>
                        {isSelected ? '▲ Click to collapse passengers' : `▼ Click to view passengers (${booked} added by ET)`}
                      </div>
                    </div>

                    {/* Expanded passenger panel — shows passengers added by ET */}
                    {isSelected && (
                      <div className="sub-section" style={{marginTop:0,borderTop:'none',borderRadius:'0 0 10px 10px',background:'rgba(8,18,9,0.95)'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                          <div>
                            <div className="sub-section-title" style={{margin:0}}>👥 Passengers added by ET</div>
                            <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>
                              This list updates live when ET adds or removes passengers
                            </div>
                          </div>
                        </div>

                        {slotPax.length === 0 ? (
                          <div style={{textAlign:'center',padding:'20px',color:'var(--text-dim)',fontSize:13,border:'1px dashed rgba(255,255,255,0.1)',borderRadius:8}}>
                            <div style={{fontSize:24,marginBottom:8}}>👤</div>
                            No passengers added yet — ET team will fill this vehicle
                          </div>
                        ) : (
                          <>
                            <div style={{overflowX:'auto'}}>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>PNR</th>
                                    <th>Ticket No.</th>
                                    <th>Pax</th>
                                    <th>Bags</th>
                                    <th>Visa</th>
                                    <th>Payment</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {slotPax.map((p, i) => (
                                    <tr key={p.id}>
                                      <td style={{color:'var(--text-dim)',fontSize:11}}>{i+1}</td>
                                      <td style={{fontWeight:500}}>{p.name||'—'}</td>
                                      <td style={{fontFamily:'monospace',color:'var(--et-green-neon)'}}>{p.pnr||'—'}</td>
                                      <td style={{fontFamily:'monospace',fontSize:12,color:'var(--text-muted)'}}>{p.ticket_number||'—'}</td>
                                      <td style={{fontWeight:700,color:'var(--et-gold-neon)'}}>{p.pax_count}</td>
                                      <td>{p.bags_count != null ? p.bags_count : '—'}</td>
                                      <td><VisaBadge v={p.visa_status} /></td>
                                      <td><PaymentBadge s={p.payment_status} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div style={{marginTop:12,padding:'10px 14px',background:'rgba(0,107,63,0.1)',border:'1px solid rgba(0,255,140,0.15)',borderRadius:8,display:'flex',gap:24,fontSize:13}}>
                              <span>Total passengers: <strong style={{color:'var(--et-gold-neon)'}}>{slotPax.reduce((s,p)=>s+Number(p.pax_count||0),0)}</strong></span>
                              <span>Total bags: <strong style={{color:'var(--et-gold-neon)'}}>{slotPax.reduce((s,p)=>s+Number(p.bags_count||0),0)}</strong></span>
                              <span>Remaining seats: <strong style={{color: total-booked===0?'var(--et-red-neon)':'var(--et-green-neon)'}}>{total - booked}</strong></span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Trip Group Detail modal */}
      {selected && (
        <TripGroupDetail role="ALSAWAN" tripGroup={selected} onClose={() => setSelected(null)} onUpdated={() => { loadGroups(); loadSlots(); }} />
      )}
    </div>
  );
}
