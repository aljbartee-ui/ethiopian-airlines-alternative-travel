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

/* Saudi airports + Kuwait (origin) */
const TRANSIT_CITIES = [
  { code:'KWI', label:'Kuwait (KWI)' },
  { code:'JED', label:'Jeddah (JED)' },
  { code:'DMM', label:'Dammam (DMM)' },
  { code:'RUH', label:'Riyadh (RUH)' },
  { code:'MED', label:'Madinah (MED)' },
  { code:'GIZ', label:'Gizan (GIZ)' },
  { code:'DXB', label:'Dubai (DXB)' },
  { code:'DOH', label:'Doha (DOH)' },
  { code:'BAH', label:'Bahrain (BAH)' },
  { code:'MCT', label:'Muscat (MCT)' },
  { code:'AUH', label:'Abu Dhabi (AUH)' },
  { code:'OTHER', label:'Other…' },
];

const EMPTY_FORM = {
  transit_city: 'KWI', transit_city_other: '',
  transit_date: '', direction: 'OUTBOUND',
  et_flight_number: '', destination: '',
  checkin_date: '', checkin_time: '',
  requested_pax: '', requester_pnr: '', requester_ticket: '',
  status: 'OPEN', demand_note: ''
};

const EMPTY_PAX = { name:'', pnr:'', ticket_number:'', pax_count:1, bags_count:'', visa_status:'NOT_APPLIED', payment_status:'AWAITING_FINAL_COST' };

function StatusBadge({ s }) {
  const map = {
    OPEN:        ['badge badge-open',       '● Open'],
    CONFIRMED:   ['badge badge-confirmed',  '✓ Confirmed'],
    CLOSED:      ['badge badge-closed',     '⊘ Closed'],
    COMPLETED:   ['badge badge-completed',  '✓ Completed'],
    NOT_FEASIBLE:['badge badge-feasible',   '✕ Not Feasible'],
    FULL:        ['badge badge-closed',     '⊘ Full'],
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
export function EtDashboard() {
  const [tripGroups,   setTripGroups]   = useState([]);
  const [allSlots,     setAllSlots]     = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [selSlot,      setSelSlot]      = useState(null);
  const [showForm,     setShowForm]     = useState(false);
  const [editGroup,    setEditGroup]    = useState(null);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);
  const [liveActive,   setLiveActive]   = useState(false);
  const [sseStatus,    setSseStatus]    = useState('connected'); // 'connected' | 'reconnecting'
  const [error,        setError]        = useState('');
  const [tab,          setTab]          = useState('groups');

  /* standalone slot pax */
  const [slotPax,      setSlotPax]      = useState([]);
  const [showPaxForm,  setShowPaxForm]  = useState(false);
  const [paxForm,      setPaxForm]      = useState(EMPTY_PAX);
  const [savingPax,    setSavingPax]    = useState(false);
  const [paxError,     setPaxError]     = useState('');

  /* edit passenger state */
  const [editingPax,   setEditingPax]   = useState(null);   // passenger object being edited
  const [editPaxForm,  setEditPaxForm]  = useState(EMPTY_PAX);
  const [savingEdit,   setSavingEdit]   = useState(false);
  const [editPaxError, setEditPaxError] = useState('');

  // Ref to avoid stale closure in SSE handler
  const selSlotRef = useRef(null);
  useEffect(() => { selSlotRef.current = selSlot; }, [selSlot]);

  const loadGroups = useCallback(async () => {
    try { setTripGroups(await api('/api/trip-groups')); } catch(e){ console.error(e); }
  }, []);

  const loadSlots = useCallback(async () => {
    try {
      const slots = await api('/api/car-slots');
      setAllSlots(slots);
      // Keep selSlot in sync with fresh data
      if (selSlotRef.current) {
        const updated = slots.find(s => s.id === selSlotRef.current.id);
        if (updated) setSelSlot(updated);
      }
    } catch(e){ console.error(e); }
  }, []);

  const loadSlotPax = useCallback(async id => {
    try { setSlotPax(await api(`/api/car-slots/${id}/passengers`)); } catch(e){ console.error(e); }
  }, []);

  useEffect(() => { loadGroups(); loadSlots(); }, [loadGroups, loadSlots]);
  useEffect(() => { if (selSlot) loadSlotPax(selSlot.id); else setSlotPax([]); }, [selSlot?.id, loadSlotPax]);

  const handleLive = useCallback(() => {
    setLiveActive(true);
    const currentSlot = selSlotRef.current;
    Promise.all([
      loadGroups(),
      loadSlots(),
      currentSlot ? loadSlotPax(currentSlot.id) : Promise.resolve()
    ]).then(() => setTimeout(() => setLiveActive(false), 2000));
  }, [loadGroups, loadSlots, loadSlotPax]);

  useSSE(
    { 'trip-groups-changed': handleLive, 'passengers-changed': handleLive, 'car-slots-changed': handleLive },
    setSseStatus
  );

  /* ── trip group form ──────────────────────────────────────────────────── */
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const openNew = () => { setEditGroup(null); setForm(EMPTY_FORM); setError(''); setShowForm(true); };

  const openEdit = (g, e) => {
    e.stopPropagation();
    const knownCodes = TRANSIT_CITIES.map(c => c.code).filter(c => c !== 'OTHER');
    const isKnown = knownCodes.includes(g.transit_city);
    setEditGroup(g);
    setForm({
      transit_city:       isKnown ? g.transit_city : 'OTHER',
      transit_city_other: isKnown ? '' : (g.transit_city || ''),
      transit_date:       g.transit_date ? g.transit_date.slice(0,10) : '',
      direction:          g.direction || 'OUTBOUND',
      et_flight_number:   g.et_flight_number || '',
      destination:        g.destination || '',
      checkin_date:       g.checkin_date ? g.checkin_date.slice(0,10) : '',
      checkin_time:       g.checkin_time ? g.checkin_time.slice(0,5) : '',
      requested_pax:      g.requested_pax || '',
      requester_pnr:      g.requester_pnr || '',
      requester_ticket:   g.requester_ticket || '',
      status:             g.status || 'OPEN',
      demand_note:        g.demand_note || ''
    });
    setError(''); setShowForm(true);
  };

  const handleDelete = async (g, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete trip group "${g.transit_city} ${fmtDate(g.transit_date)}"?\nAll passengers will also be deleted.`)) return;
    try {
      await api(`/api/trip-groups/${g.id}`, { method: 'DELETE' });
      if (selected?.id === g.id) setSelected(null);
      loadGroups();
    } catch (err) { alert(err.message || 'Failed to delete'); }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.transit_date) { setError('Transit date is required'); return; }
    const city = form.transit_city === 'OTHER' ? form.transit_city_other : form.transit_city;
    if (!city) { setError('Transit city is required'); return; }
    setSaving(true); setError('');
    try {
      const url    = editGroup ? `/api/trip-groups/${editGroup.id}` : '/api/trip-groups';
      const method = editGroup ? 'PUT' : 'POST';
      await api(url, { method, body: JSON.stringify({
        ...form,
        transit_city:     city,
        requested_pax:    form.requested_pax    ? Number(form.requested_pax)    : null,
        et_flight_number: form.et_flight_number || null,
        destination:      form.destination      || null,
        checkin_date:     form.checkin_date      || null,
        checkin_time:     form.checkin_time      || null,
        requester_pnr:    form.requester_pnr     || null,
        requester_ticket: form.requester_ticket  || null,
        demand_note:      form.demand_note       || null
      })});
      setShowForm(false); loadGroups();
    } catch (err) { setError(err.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  /* ── standalone pax: add ──────────────────────────────────────────────── */
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

  /* ── standalone pax: open edit ────────────────────────────────────────── */
  const openEditPax = pax => {
    setEditingPax(pax);
    setEditPaxForm({
      name:           pax.name           || '',
      pnr:            pax.pnr            || '',
      ticket_number:  pax.ticket_number  || '',
      pax_count:      pax.pax_count      || 1,
      bags_count:     pax.bags_count     != null ? pax.bags_count : '',
      visa_status:    pax.visa_status    || 'NOT_APPLIED',
      payment_status: pax.payment_status || 'AWAITING_FINAL_COST',
    });
    setEditPaxError('');
    // Close add form if open
    setShowPaxForm(false);
  };

  /* ── standalone pax: save edit ────────────────────────────────────────── */
  const handleEditPaxSubmit = async e => {
    e.preventDefault();
    if (!editingPax) return;
    setSavingEdit(true); setEditPaxError('');
    try {
      const body = {
        ...editPaxForm,
        pax_count:  Number(editPaxForm.pax_count) || 1,
        bags_count: editPaxForm.bags_count !== '' ? Number(editPaxForm.bags_count) : null,
        car_slot_id: editingPax.car_slot_id,
      };
      await api(`/api/passengers/${editingPax.id}`, { method:'PUT', body: JSON.stringify(body) });
      setEditingPax(null);
      if (selSlot) await loadSlotPax(selSlot.id);
      await loadSlots();
    } catch(err) { setEditPaxError(err.message || 'Failed to update passenger'); }
    finally { setSavingEdit(false); }
  };

  /* ── standalone pax: delete ───────────────────────────────────────────── */
  const handlePaxDelete = async id => {
    if (!window.confirm('Remove this passenger?')) return;
    // If we were editing this passenger, cancel edit
    if (editingPax?.id === id) setEditingPax(null);
    await api(`/api/passengers/${id}`, { method:'DELETE' });
    if (selSlot) await loadSlotPax(selSlot.id);
    await loadSlots();
  };

  /* ── derived ──────────────────────────────────────────────────────────── */
  const standaloneSlots = allSlots.filter(s => !s.trip_group_id);
  const openSlots       = standaloneSlots.filter(s => s.status === 'OPEN' || s.status === 'COLLECTING');

  return (
    <div className="main">

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{tripGroups.length}</div>
          <div className="stat-label">Trip Groups</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--et-gold-neon)',textShadow:'var(--glow-gold)'}}>
            {tripGroups.reduce((s,g) => s+Number(g.requested_pax||0), 0)}
          </div>
          <div className="stat-label">Requested Pax</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{tripGroups.reduce((s,g) => s+Number(g.total_pax||0), 0)}</div>
          <div className="stat-label">Booked Pax</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--et-gold-neon)',textShadow:'var(--glow-gold)'}}>
            {openSlots.length}
          </div>
          <div className="stat-label">Available Vehicles</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:8,marginBottom:4}}>
        <button className={`button${tab==='groups'?'':' ghost'}`} onClick={() => setTab('groups')}>✈ My Trip Groups</button>
        <button className={`button${tab==='vehicles'?'':' ghost'}`} onClick={() => setTab('vehicles')}>
          🚌 Available Vehicles
          {openSlots.length > 0 && <span className="badge badge-open" style={{marginLeft:6}}>{openSlots.length} open</span>}
        </button>
      </div>

      {/* ── Tab: Trip Groups ─────────────────────────────────────────────── */}
      {tab === 'groups' && (
        <div className="card">
          <div className="section-header">
            <div className="section-title">
              <div>
                <div className="card-title">✈ My Trip Groups</div>
                <div className="card-subtitle">Create and manage transit coordination requests</div>
              </div>
              <span className={`live-dot${sseStatus==='reconnecting'?' reconnecting':liveActive?' active':''}`}>
                <span className="live-dot-circle" />
                {sseStatus === 'reconnecting' ? 'RECONNECTING…' : 'LIVE'}
              </span>
            </div>
            <button className="button" onClick={openNew}>+ New Trip Group</button>
          </div>

          {showForm && (
            <div className="sub-section" style={{marginBottom:18}}>
              <div className="sub-section-title">{editGroup ? '✏ Edit Trip Group' : '+ New Trip Group'}</div>
              {error && <div className="error-box">⚠ {error}</div>}
              <form onSubmit={handleSubmit}>
                <div className="form-section-label">Flight Details</div>
                <div className="form-row">
                  <div className="form-field">
                    <label className="label">Transit City *</label>
                    <select className="select" value={form.transit_city} onChange={e => f('transit_city', e.target.value)}>
                      {TRANSIT_CITIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                    </select>
                  </div>
                  {form.transit_city === 'OTHER' && (
                    <div className="form-field">
                      <label className="label">Airport Code / City *</label>
                      <input className="input" placeholder="e.g. TIF" value={form.transit_city_other}
                        onChange={e => f('transit_city_other', e.target.value)} required />
                    </div>
                  )}
                  <div className="form-field">
                    <label className="label">Transit Date *</label>
                    <input className="input" type="date" value={form.transit_date}
                      onChange={e => f('transit_date', e.target.value)} required />
                  </div>
                  <div className="form-field">
                    <label className="label">Direction</label>
                    <select className="select" value={form.direction} onChange={e => f('direction', e.target.value)}>
                      <option value="OUTBOUND">Outbound (to airport)</option>
                      <option value="INBOUND">Inbound (from airport)</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label className="label">ET Flight Number</label>
                    <input className="input" placeholder="e.g. ET 308" value={form.et_flight_number}
                      onChange={e => f('et_flight_number', e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label className="label">Destination</label>
                    <input className="input" placeholder="e.g. Addis Ababa (ADD)" value={form.destination}
                      onChange={e => f('destination', e.target.value)} />
                  </div>
                </div>

                <div className="form-section-label">Check-in Details</div>
                <div className="form-row">
                  <div className="form-field">
                    <label className="label">Check-in Date</label>
                    <input className="input" type="date" value={form.checkin_date}
                      onChange={e => f('checkin_date', e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label className="label">Check-in Time</label>
                    <input className="input" type="time" value={form.checkin_time}
                      onChange={e => f('checkin_time', e.target.value)} />
                  </div>
                </div>

                <div className="form-section-label">Requester Info</div>
                <div className="form-row">
                  <div className="form-field">
                    <label className="label">Requested Pax Count</label>
                    <input className="input" type="number" min="1" placeholder="e.g. 12"
                      value={form.requested_pax} onChange={e => f('requested_pax', e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label className="label">Requester PNR</label>
                    <input className="input" placeholder="e.g. ABC123" value={form.requester_pnr}
                      onChange={e => f('requester_pnr', e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label className="label">Requester Ticket No.</label>
                    <input className="input" placeholder="e.g. 071-1234567890" value={form.requester_ticket}
                      onChange={e => f('requester_ticket', e.target.value)} />
                  </div>
                </div>

                <div className="form-section-label">Status & Notes</div>
                <div className="form-row">
                  <div className="form-field">
                    <label className="label">Status</label>
                    <select className="select" value={form.status} onChange={e => f('status', e.target.value)}>
                      <option value="OPEN">Open</option>
                      <option value="CONFIRMED">Confirmed</option>
                      <option value="CLOSED">Closed</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="NOT_FEASIBLE">Not Feasible</option>
                    </select>
                  </div>
                  <div className="form-field" style={{flex:'2 1 260px'}}>
                    <label className="label">Demand Note</label>
                    <input className="input" placeholder="Any special notes…" value={form.demand_note}
                      onChange={e => f('demand_note', e.target.value)} />
                  </div>
                </div>

                <div style={{display:'flex',gap:10,marginTop:4}}>
                  <button className="button" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : editGroup ? '✓ Update Group' : '+ Create Group'}
                  </button>
                  <button className="button ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {tripGroups.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✈</div>
              <div style={{fontWeight:600,marginBottom:6}}>No trip groups yet</div>
              <div style={{fontSize:12}}>Click "New Trip Group" to create the first one</div>
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th><th>City</th><th>Dir</th><th>Flight</th>
                    <th>Destination</th><th>Check-in</th>
                    <th>Req Pax</th><th>Booked</th><th>Vehicles</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tripGroups.map(g => (
                    <tr key={g.id} style={{cursor:'pointer'}} onClick={() => setSelected(selected?.id===g.id ? null : g)}>
                      <td style={{whiteSpace:'nowrap',fontWeight:500}}>{fmtDate(g.transit_date)}</td>
                      <td><strong style={{color:'var(--text-main)'}}>{g.transit_city}</strong></td>
                      <td>
                        <span style={{fontSize:11,fontWeight:700,color:g.direction==='OUTBOUND'?'var(--et-green-neon)':'var(--et-gold-neon)'}}>
                          {g.direction==='OUTBOUND'?'↑ OUT':'↓ IN'}
                        </span>
                      </td>
                      <td style={{color:'var(--text-main)',fontWeight:600}}>{g.et_flight_number||'—'}</td>
                      <td style={{color:'var(--text-muted)',fontSize:12}}>{g.destination||'—'}</td>
                      <td style={{fontSize:12,whiteSpace:'nowrap'}}>
                        {g.checkin_date ? fmtDate(g.checkin_date) : '—'}
                        {g.checkin_time ? ` ${fmtTime(g.checkin_time)}` : ''}
                      </td>
                      <td style={{color:'var(--et-gold-neon)',fontWeight:700}}>{g.requested_pax||'—'}</td>
                      <td style={{fontWeight:600}}>{Number(g.total_pax||0)}</td>
                      <td>{g.car_slot_count||0}</td>
                      <td><StatusBadge s={g.status} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{display:'flex',gap:6}}>
                          <button className="button ghost" style={{padding:'5px 10px',fontSize:11}} onClick={e => openEdit(g, e)}>Edit</button>
                          <button className="button secondary" style={{padding:'5px 10px',fontSize:11}} onClick={e => handleDelete(g, e)}>Delete</button>
                          <button className="button" style={{padding:'5px 10px',fontSize:11}} onClick={() => setSelected(g)}>→</button>
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

      {/* ── Tab: Available Vehicles (standalone from Alsawan) ────────────── */}
      {tab === 'vehicles' && (
        <div className="card">
          <div className="section-header" style={{marginBottom:14}}>
            <div>
              <div className="card-title">🚌 Available Vehicles from Alsawan</div>
              <div className="card-subtitle">Standalone vehicles posted by Alsawan — click to manage passengers</div>
            </div>
          </div>

          {standaloneSlots.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🚌</div>
              <div style={{fontWeight:600,marginBottom:6}}>No standalone vehicles available yet</div>
              <div style={{fontSize:12}}>Alsawan will post available vehicles here</div>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {standaloneSlots.map(slot => {
                const booked = Number(slot.booked_pax||0);
                const total  = Number(slot.total_seats||0);
                const pct    = total > 0 ? Math.min(100, Math.round(booked/total*100)) : 0;
                const isSelected = selSlot?.id === slot.id;
                const isFull = slot.status === 'FULL' || slot.status === 'COMPLETED';

                return (
                  <div key={slot.id}>
                    <div
                      className={`vehicle-card${slot.status==='FULL'?' full':slot.status==='COMPLETED'?' completed':pct>=80?' near-full':''}`}
                      style={{cursor: isFull ? 'default' : 'pointer', opacity: isFull ? 0.75 : 1}}
                      onClick={() => {
                        if (!isFull) {
                          if (isSelected) {
                            setSelSlot(null);
                          } else {
                            setSelSlot(slot);
                          }
                          setShowPaxForm(false);
                          setPaxForm(EMPTY_PAX);
                          setPaxError('');
                          setEditingPax(null);
                          setEditPaxError('');
                        }
                      }}
                    >
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                          <span style={{fontWeight:700,fontSize:15}}>{slot.vehicle_type}</span>
                          <StatusBadge s={slot.status} />
                          {slot.transit_city && (
                            <span style={{fontSize:12,background:'rgba(0,107,63,0.2)',border:'1px solid rgba(0,255,140,0.2)',borderRadius:4,padding:'2px 8px',color:'var(--et-green-neon)',fontWeight:600}}>
                              {slot.transit_city}
                            </span>
                          )}
                          {slot.service_date && (
                            <span style={{fontSize:12,color:'var(--text-muted)'}}>📅 {fmtDate(slot.service_date)}</span>
                          )}
                        {slot.total_vehicle_price_kwd && (() => {
                            const perPax = booked > 0 ? (Number(slot.total_vehicle_price_kwd) / booked).toFixed(3) : null;
                            return (
                              <span style={{fontSize:12,background:'rgba(245,166,35,0.12)',border:'1px solid rgba(245,166,35,0.35)',borderRadius:4,padding:'2px 8px',color:'var(--et-gold-neon)',fontWeight:700}}>
                                💰 {perPax ? `${perPax} KWD/pax` : `${Number(slot.total_vehicle_price_kwd).toFixed(3)} KWD total`}
                              </span>
                            );
                          })()}
                        {!slot.total_vehicle_price_kwd && slot.per_pax_cost_kwd && (
                            <span style={{fontSize:12,color:'var(--et-green-neon)',fontWeight:600}}>{slot.per_pax_cost_kwd} KWD/pax</span>
                          )}
                        </div>
                        {isFull && <span style={{fontSize:12,color:'var(--text-dim)'}}>Vehicle is {slot.status} — no more passengers can be added</span>}
                      </div>

                      <div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:8,fontSize:12,color:'var(--text-muted)'}}>
                        <span>🪑 {booked}/{total} seats</span>
                        {slot.bag_limit_per_pax && <span>🧳 Max {slot.bag_limit_per_pax} bags/pax</span>}
                        {slot.bag_limit_note && <span>📋 {slot.bag_limit_note}</span>}
                        {slot.pickup_time && <span>📍 Pickup: {fmtTime(slot.pickup_time)}</span>}
                        {slot.departure_time && <span>🚀 Departs: {fmtTime(slot.departure_time)}</span>}
                        {slot.pickup_location_url && (
                          <a href={slot.pickup_location_url} target="_blank" rel="noreferrer"
                            style={{color:'var(--et-green-neon)',textDecoration:'none'}} onClick={e => e.stopPropagation()}>
                            📌 Pickup location ↗
                          </a>
                        )}
                        {slot.total_vehicle_price_kwd && (
                          <span style={{color:'var(--et-gold-neon)',fontWeight:600}}>
                            💰 Total: {Number(slot.total_vehicle_price_kwd).toFixed(3)} KWD
                            {booked > 0 && (
                              <span style={{color:'var(--et-green-neon)',marginLeft:6}}>
                                → {(Number(slot.total_vehicle_price_kwd) / booked).toFixed(3)} KWD/pax
                              </span>
                            )}
                          </span>
                        )}
                        {slot.alsawan_note && <span style={{color:'var(--et-gold-neon)'}}>💬 {slot.alsawan_note}</span>}
                      </div>

                      <div style={{marginTop:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-dim)',marginBottom:4}}>
                          <span>{booked} booked · {total - booked} remaining · {Number(slot.booked_bags||0)} bags</span>
                          <span>{pct}% full</span>
                        </div>
                        <div style={{height:6,background:'rgba(255,255,255,0.08)',borderRadius:3}}>
                          <div style={{
                            height:'100%',borderRadius:3,transition:'width 0.4s',
                            width:`${pct}%`,
                            background: slot.status==='FULL' ? 'var(--danger)' : pct>=80 ? 'var(--warning)' : 'var(--success)'
                          }} />
                        </div>
                      </div>

                      {!isFull && (
                        <div style={{marginTop:8,fontSize:12,color:'var(--text-dim)'}}>
                          {isSelected ? '▲ Click to collapse' : '▼ Click to manage passengers'}
                        </div>
                      )}
                    </div>

                    {/* Expanded passenger panel */}
                    {isSelected && !isFull && (
                      <div className="sub-section" style={{marginTop:0,borderTop:'none',borderRadius:'0 0 10px 10px',background:'rgba(8,18,9,0.9)'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                          <div className="sub-section-title" style={{margin:0}}>👥 Passengers in this Vehicle</div>
                          <button className="button" style={{fontSize:12,padding:'6px 12px'}}
                            onClick={() => {
                              setShowPaxForm(v => !v);
                              setPaxForm(EMPTY_PAX);
                              setPaxError('');
                              // Cancel any open edit when toggling add form
                              setEditingPax(null);
                              setEditPaxError('');
                            }}>
                            {showPaxForm ? '✕ Cancel' : '+ Add Passenger'}
                          </button>
                        </div>

                        {/* Add passenger form */}
                        {showPaxForm && (
                          <form onSubmit={handlePaxSubmit} style={{marginBottom:14,padding:'12px',background:'rgba(0,255,140,0.04)',borderRadius:8,border:'1px solid rgba(0,255,140,0.1)'}}>
                            <div style={{fontSize:12,fontWeight:600,color:'var(--et-green-neon)',marginBottom:8}}>New Passenger</div>
                            <div className="form-row">
                              <div className="form-field"><label className="label">Name</label>
                                <input className="input" value={paxForm.name} onChange={e => setPaxForm(p=>({...p,name:e.target.value}))} placeholder="Passenger name" /></div>
                              <div className="form-field"><label className="label">PNR</label>
                                <input className="input" value={paxForm.pnr} onChange={e => setPaxForm(p=>({...p,pnr:e.target.value}))} placeholder="e.g. ABC123" /></div>
                              <div className="form-field"><label className="label">Ticket No.</label>
                                <input className="input" value={paxForm.ticket_number} onChange={e => setPaxForm(p=>({...p,ticket_number:e.target.value}))} placeholder="e.g. 0711234567890" /></div>
                              <div className="form-field" style={{flex:'0 1 100px'}}><label className="label">Pax Count</label>
                                <input className="input" type="number" min="1" value={paxForm.pax_count} onChange={e => setPaxForm(p=>({...p,pax_count:e.target.value}))} /></div>
                              <div className="form-field" style={{flex:'0 1 100px'}}><label className="label">Bags</label>
                                <input className="input" type="number" min="0" value={paxForm.bags_count} onChange={e => setPaxForm(p=>({...p,bags_count:e.target.value}))} placeholder="0" /></div>
                              <div className="form-field"><label className="label">Visa Status</label>
                                <select className="select" value={paxForm.visa_status} onChange={e => setPaxForm(p=>({...p,visa_status:e.target.value}))}>
                                  <option value="NOT_APPLIED">Not Applied</option>
                                  <option value="IN_PROCESS">In Process</option>
                                  <option value="APPROVED">Approved</option>
                                </select></div>
                              <div className="form-field"><label className="label">Payment Status</label>
                                <select className="select" value={paxForm.payment_status} onChange={e => setPaxForm(p=>({...p,payment_status:e.target.value}))}>
                                  <option value="AWAITING_FINAL_COST">Awaiting Final Cost</option>
                                  <option value="ADVISED_TO_PAY">Advised to Pay</option>
                                  <option value="PAID">Paid</option>
                                </select></div>
                            </div>
                            {paxError && <div className="error-box">⚠ {paxError}</div>}
                            <div style={{display:'flex',gap:8}}>
                              <button className="button" type="submit" disabled={savingPax}>{savingPax ? 'Saving…' : '+ Add Passenger'}</button>
                              <button type="button" className="button ghost" onClick={() => setShowPaxForm(false)}>Cancel</button>
                            </div>
                          </form>
                        )}

                        {/* Passenger list */}
                        {slotPax.length === 0 ? (
                          <div style={{textAlign:'center',padding:'16px',color:'var(--text-dim)',fontSize:13}}>No passengers added yet — click "+ Add Passenger" above</div>
                        ) : (
                          <>
                            <div style={{overflowX:'auto'}}>
                              <table className="table">
                                <thead>
                                  <tr><th>Name</th><th>PNR</th><th>Ticket</th><th>Pax</th><th>Bags</th><th>Visa</th><th>Payment</th><th>Actions</th></tr>
                                </thead>
                                <tbody>
                                  {slotPax.map(p => (
                                    <React.Fragment key={p.id}>
                                      <tr style={editingPax?.id === p.id ? {background:'rgba(0,255,140,0.05)'} : {}}>
                                        <td>{p.name||'—'}</td>
                                        <td style={{fontFamily:'monospace'}}>{p.pnr||'—'}</td>
                                        <td style={{fontFamily:'monospace',fontSize:12}}>{p.ticket_number||'—'}</td>
                                        <td>{p.pax_count}</td>
                                        <td>{p.bags_count??'—'}</td>
                                        <td><VisaBadge v={p.visa_status} /></td>
                                        <td><PaymentBadge s={p.payment_status} /></td>
                                        <td>
                                          <div style={{display:'flex',gap:6}}>
                                            <button
                                              className="button ghost"
                                              style={{padding:'4px 10px',fontSize:11}}
                                              onClick={() => {
                                                if (editingPax?.id === p.id) {
                                                  setEditingPax(null);
                                                } else {
                                                  openEditPax(p);
                                                  setShowPaxForm(false);
                                                }
                                              }}>
                                              {editingPax?.id === p.id ? 'Cancel' : 'Edit'}
                                            </button>
                                            <button
                                              className="button secondary"
                                              style={{padding:'4px 10px',fontSize:11}}
                                              onClick={() => handlePaxDelete(p.id)}>
                                              Delete
                                            </button>
                                          </div>
                                        </td>
                                      </tr>

                                      {/* Inline edit form row */}
                                      {editingPax?.id === p.id && (
                                        <tr>
                                          <td colSpan={8} style={{padding:0}}>
                                            <form
                                              onSubmit={handleEditPaxSubmit}
                                              style={{padding:'12px 14px',background:'rgba(0,255,140,0.06)',borderTop:'1px solid rgba(0,255,140,0.15)',borderBottom:'1px solid rgba(0,255,140,0.15)'}}
                                            >
                                              <div style={{fontSize:12,fontWeight:600,color:'var(--et-green-neon)',marginBottom:8}}>
                                                ✏ Editing: {p.name || 'Passenger #' + p.id}
                                              </div>
                                              <div className="form-row">
                                                <div className="form-field">
                                                  <label className="label">Name</label>
                                                  <input className="input" value={editPaxForm.name}
                                                    onChange={e => setEditPaxForm(f=>({...f,name:e.target.value}))}
                                                    placeholder="Passenger name" />
                                                </div>
                                                <div className="form-field">
                                                  <label className="label">PNR</label>
                                                  <input className="input" value={editPaxForm.pnr}
                                                    onChange={e => setEditPaxForm(f=>({...f,pnr:e.target.value}))}
                                                    placeholder="e.g. ABC123" />
                                                </div>
                                                <div className="form-field">
                                                  <label className="label">Ticket No.</label>
                                                  <input className="input" value={editPaxForm.ticket_number}
                                                    onChange={e => setEditPaxForm(f=>({...f,ticket_number:e.target.value}))}
                                                    placeholder="e.g. 0711234567890" />
                                                </div>
                                                <div className="form-field" style={{flex:'0 1 100px'}}>
                                                  <label className="label">Pax Count</label>
                                                  <input className="input" type="number" min="1"
                                                    value={editPaxForm.pax_count}
                                                    onChange={e => setEditPaxForm(f=>({...f,pax_count:e.target.value}))} />
                                                </div>
                                                <div className="form-field" style={{flex:'0 1 100px'}}>
                                                  <label className="label">Bags</label>
                                                  <input className="input" type="number" min="0"
                                                    value={editPaxForm.bags_count}
                                                    onChange={e => setEditPaxForm(f=>({...f,bags_count:e.target.value}))}
                                                    placeholder="0" />
                                                </div>
                                                <div className="form-field">
                                                  <label className="label">Visa Status</label>
                                                  <select className="select" value={editPaxForm.visa_status}
                                                    onChange={e => setEditPaxForm(f=>({...f,visa_status:e.target.value}))}>
                                                    <option value="NOT_APPLIED">Not Applied</option>
                                                    <option value="IN_PROCESS">In Process</option>
                                                    <option value="APPROVED">Approved</option>
                                                  </select>
                                                </div>
                                                <div className="form-field">
                                                  <label className="label">Payment Status</label>
                                                  <select className="select" value={editPaxForm.payment_status}
                                                    onChange={e => setEditPaxForm(f=>({...f,payment_status:e.target.value}))}>
                                                    <option value="AWAITING_FINAL_COST">Awaiting Final Cost</option>
                                                    <option value="ADVISED_TO_PAY">Advised to Pay</option>
                                                    <option value="PAID">Paid</option>
                                                  </select>
                                                </div>
                                              </div>
                                              {editPaxError && <div className="error-box">⚠ {editPaxError}</div>}
                                              <div style={{display:'flex',gap:8,marginTop:4}}>
                                                <button className="button" type="submit" disabled={savingEdit}>
                                                  {savingEdit ? 'Saving…' : '✓ Save Changes'}
                                                </button>
                                                <button type="button" className="button ghost"
                                                  onClick={() => { setEditingPax(null); setEditPaxError(''); }}>
                                                  Cancel
                                                </button>
                                              </div>
                                            </form>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div style={{marginTop:10,fontSize:12,color:'var(--text-muted)',display:'flex',gap:20,flexWrap:'wrap',padding:'10px 14px',background:'rgba(0,107,63,0.07)',border:'1px solid rgba(0,255,140,0.1)',borderRadius:8}}>
                              <span>Total pax: <strong style={{color:'var(--text-main)'}}>{slotPax.reduce((s,p)=>s+p.pax_count,0)}</strong></span>
                              <span>Total bags: <strong style={{color:'var(--text-main)'}}>{slotPax.reduce((s,p)=>s+(p.bags_count||0),0)}</strong></span>
                              {selSlot?.total_vehicle_price_kwd && (() => {
                                const totalBooked = slotPax.reduce((s,p)=>s+p.pax_count,0);
                                const totalPrice  = Number(selSlot.total_vehicle_price_kwd);
                                const perPax      = totalBooked > 0 ? (totalPrice / totalBooked).toFixed(3) : null;
                                return (
                                  <>
                                    <span>Vehicle total: <strong style={{color:'var(--et-gold-neon)'}}>{totalPrice.toFixed(3)} KWD</strong></span>
                                    {perPax && (
                                      <span style={{fontWeight:700,color:'var(--et-green-neon)',fontSize:13}}>
                                        💰 Current price per pax: <strong>{perPax} KWD</strong>
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
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
        <TripGroupDetail role="ET" tripGroup={selected} onClose={() => setSelected(null)} onUpdated={loadGroups} />
      )}
    </div>
  );
}
