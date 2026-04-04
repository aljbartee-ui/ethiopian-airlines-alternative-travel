import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';
import { TripGroupDetail } from './TripGroupDetail';

const fmtDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
};

const EMPTY_CAR = {
  trip_group_id: '', vehicle_type: 'BUS', total_seats: '',
  bag_limit_per_pax: '', bag_limit_note: '',
  per_pax_cost_kwd: '', pickup_location_url: '',
  pickup_time: '', departure_time: '',
  service_date: '', alsawan_note: ''
};

const STATUS_CLASS = {
  OPEN:'badge-open', CONFIRMED:'badge-confirmed', CLOSED:'badge-closed',
  COMPLETED:'badge-completed', NOT_FEASIBLE:'badge-feasible'
};

export function AlsawanDashboard() {
  const [groups, setGroups]           = useState([]);
  const [selected, setSelected]       = useState(null);
  const [showCarForm, setShowCarForm] = useState(false);
  const [editCar, setEditCar]         = useState(null);
  const [carForm, setCarForm]         = useState(EMPTY_CAR);
  const [saving, setSaving]           = useState(false);
  const [liveActive, setLiveActive]   = useState(false);
  const [error, setError]             = useState('');

  const load = useCallback(async () => {
    try { const d = await api('/api/trip-groups'); setGroups(d); } catch(e){ console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLive = useCallback(() => {
    setLiveActive(true);
    load().then(() => setTimeout(() => setLiveActive(false), 2000));
  }, [load]);

  useSSE({ 'trip-groups-changed': handleLive, 'passengers-changed': handleLive, 'car-slots-changed': handleLive });

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
      const body = {
        ...carForm,
        total_seats:         Number(carForm.total_seats),
        bag_limit_per_pax:   carForm.bag_limit_per_pax   ? Number(carForm.bag_limit_per_pax)   : null,
        per_pax_cost_kwd:    carForm.per_pax_cost_kwd    ? Number(carForm.per_pax_cost_kwd)    : null,
        trip_group_id:       carForm.trip_group_id       || null,
        pickup_location_url: carForm.pickup_location_url || null,
        pickup_time:         carForm.pickup_time         || null,
        departure_time:      carForm.departure_time      || null,
        service_date:        carForm.service_date        || null,
        bag_limit_note:      carForm.bag_limit_note      || null,
        alsawan_note:        carForm.alsawan_note        || null
      };

      if (editCar) {
        await api(`/api/car-slots/${editCar.id}`, { method:'PUT', body: JSON.stringify({ ...body, status: editCar.status || 'OPEN' }) });
      } else if (body.trip_group_id) {
        await api(`/api/trip-groups/${body.trip_group_id}/car-slots`, { method:'POST', body: JSON.stringify(body) });
      } else {
        await api('/api/car-slots', { method:'POST', body: JSON.stringify(body) });
      }
      setShowCarForm(false); load();
    } catch (err) { setError(err.message || 'Failed to save vehicle'); }
    finally { setSaving(false); }
  };

  const cf = (k, v) => setCarForm(p => ({ ...p, [k]: v }));

  const totalPax   = groups.reduce((s,g)=>s+Number(g.total_pax||0),0);
  const totalBags  = groups.reduce((s,g)=>s+Number(g.total_bags||0),0);
  const totalVeh   = groups.reduce((s,g)=>s+Number(g.car_slot_count||0),0);

  return (
    <div className="main">
      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{groups.length}</div>
          <div className="stat-label">Active Groups</div>
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

      {/* Add Vehicle */}
      <div className="card">
        <div className="section-header">
          <div className="section-title">
            <div>
              <div className="card-title">🚌 Add Available Vehicle</div>
              <div className="card-subtitle">Post a vehicle — link to a trip group or set a standalone date</div>
            </div>
            <span className={`live-dot${liveActive?' active':''}`}>
              <span className="live-dot-circle" /> LIVE
            </span>
          </div>
          <button className="button gold" onClick={()=>openAddCar('')}>+ Add Vehicle</button>
        </div>

        {showCarForm && (
          <div className="sub-section">
            <div className="sub-section-title">{editCar ? '✏ Edit Vehicle' : '+ New Vehicle'}</div>
            {error && <div className="error-box">⚠ {error}</div>}
            <form onSubmit={handleCarSubmit}>
              <div className="form-section-label">Link to Trip Group (optional)</div>
              <div className="form-row">
                <div className="form-field" style={{flex:'2 1 260px'}}>
                  <label className="label">Trip Group</label>
                  <select className="select" value={carForm.trip_group_id} onChange={e=>cf('trip_group_id',e.target.value)}>
                    <option value="">— Standalone (no group) —</option>
                    {groups.map(g=>(
                      <option key={g.id} value={g.id}>
                        {fmtDate(g.transit_date)} · {g.transit_city} · {g.direction} · {g.et_flight_number||'No flight'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label className="label">Service Date</label>
                  <input className="input" type="date" value={carForm.service_date} onChange={e=>cf('service_date',e.target.value)} />
                </div>
              </div>

              <div className="form-section-label">Vehicle Details</div>
              <div className="form-row">
                <div className="form-field">
                  <label className="label">Vehicle Type *</label>
                  <select className="select" value={carForm.vehicle_type} onChange={e=>cf('vehicle_type',e.target.value)}>
                    <option value="BUS">Bus</option>
                    <option value="MINIBUS">Minibus</option>
                    <option value="VAN">Van</option>
                    <option value="SUV">SUV</option>
                    <option value="SEDAN">Sedan</option>
                    <option value="COASTER">Coaster</option>
                  </select>
                </div>
                <div className="form-field">
                  <label className="label">Total Seats *</label>
                  <input className="input" type="number" min="1" placeholder="e.g. 45" value={carForm.total_seats} onChange={e=>cf('total_seats',e.target.value)} required />
                </div>
                <div className="form-field">
                  <label className="label">Cost per Pax (KWD)</label>
                  <input className="input" type="number" min="0" step="0.01" placeholder="e.g. 3.500" value={carForm.per_pax_cost_kwd} onChange={e=>cf('per_pax_cost_kwd',e.target.value)} />
                </div>
              </div>

              <div className="form-section-label">Baggage Limits</div>
              <div className="form-row">
                <div className="form-field">
                  <label className="label">Max Bags per Pax</label>
                  <input className="input" type="number" min="0" placeholder="e.g. 2" value={carForm.bag_limit_per_pax} onChange={e=>cf('bag_limit_per_pax',e.target.value)} />
                </div>
                <div className="form-field" style={{flex:'2 1 260px'}}>
                  <label className="label">Bag Limit Note</label>
                  <input className="input" placeholder="e.g. Max 23kg per bag, no oversize" value={carForm.bag_limit_note} onChange={e=>cf('bag_limit_note',e.target.value)} />
                </div>
              </div>

              <div className="form-section-label">Timing & Pickup</div>
              <div className="form-row">
                <div className="form-field">
                  <label className="label">Pickup Time</label>
                  <input className="input" type="time" value={carForm.pickup_time} onChange={e=>cf('pickup_time',e.target.value)} />
                </div>
                <div className="form-field">
                  <label className="label">Departure Time</label>
                  <input className="input" type="time" value={carForm.departure_time} onChange={e=>cf('departure_time',e.target.value)} />
                </div>
                <div className="form-field" style={{flex:'2 1 260px'}}>
                  <label className="label">Pickup Location Link (optional)</label>
                  <input className="input" type="url" placeholder="https://maps.google.com/..." value={carForm.pickup_location_url} onChange={e=>cf('pickup_location_url',e.target.value)} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field" style={{flex:'1 1 100%'}}>
                  <label className="label">Note for ET Team</label>
                  <input className="input" placeholder="Any note for ET team…" value={carForm.alsawan_note} onChange={e=>cf('alsawan_note',e.target.value)} />
                </div>
              </div>

              <div style={{display:'flex',gap:10,marginTop:4}}>
                <button className="button gold" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : editCar ? '✓ Update Vehicle' : '+ Add Vehicle'}
                </button>
                <button className="button ghost" type="button" onClick={()=>setShowCarForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Trip Groups overview */}
      <div className="card">
        <div className="section-header">
          <div className="section-title">
            <div>
              <div className="card-title">📋 ET Trip Requests</div>
              <div className="card-subtitle">View all ET requests, pax counts, bags and fill rates</div>
            </div>
          </div>
        </div>

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
                  <th>Transit Date</th><th>City</th><th>Dir</th><th>Flight</th>
                  <th>Req Pax</th><th>Booked Pax</th><th>Total Bags</th>
                  <th>Vehicles</th><th>Fill Rate</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const bookedPax  = Number(g.total_pax||0);
                  const totalSeats = Number(g.total_seats_available||0);
                  const fillPct    = totalSeats > 0 ? Math.min(100, Math.round(bookedPax/totalSeats*100)) : 0;
                  const barClass   = fillPct >= 90 ? 'high' : fillPct >= 60 ? 'medium' : 'low';
                  return (
                    <tr key={g.id} style={{cursor:'pointer'}} onClick={()=>setSelected(selected?.id===g.id?null:g)}>
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
                            <div style={{fontSize:11,marginBottom:4,color:'var(--text-muted)'}}>
                              {bookedPax}/{totalSeats} ({fillPct}%)
                            </div>
                            <div className="capacity-bar-track">
                              <div className={`capacity-bar-fill ${barClass}`} style={{width:`${fillPct}%`}} />
                            </div>
                          </div>
                        ) : <span style={{color:'var(--text-dim)',fontSize:11}}>No vehicles</span>}
                      </td>
                      <td><span className={`badge ${STATUS_CLASS[g.status]||'badge-open'}`}>{g.status||'OPEN'}</span></td>
                      <td onClick={e=>e.stopPropagation()}>
                        <div style={{display:'flex',gap:6}}>
                          <button className="button gold" style={{padding:'5px 10px',fontSize:11}} onClick={()=>openAddCar(String(g.id))}>+ Vehicle</button>
                          <button className="button ghost" style={{padding:'5px 10px',fontSize:11}} onClick={()=>setSelected(g)}>→</button>
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

      {selected && (
        <TripGroupDetail role="ALSAWAN" tripGroup={selected} onClose={()=>setSelected(null)} onUpdated={load} />
      )}
    </div>
  );
}
