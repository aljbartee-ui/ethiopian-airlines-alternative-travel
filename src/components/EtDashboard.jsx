import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';
import { TripGroupDetail } from './TripGroupDetail';

const fmtDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
};

const EMPTY_FORM = {
  transit_city: 'KWI', transit_date: '', direction: 'OUTBOUND',
  et_flight_number: '', destination: '',
  checkin_date: '', checkin_time: '',
  requested_pax: '', requester_pnr: '', requester_ticket: '',
  status: 'OPEN', demand_note: ''
};

const STATUS_CLASS = {
  OPEN:'badge-open', CONFIRMED:'badge-confirmed', CLOSED:'badge-closed',
  COMPLETED:'badge-completed', NOT_FEASIBLE:'badge-feasible'
};

export function EtDashboard() {
  const [tripGroups, setTripGroups] = useState([]);
  const [selected, setSelected]     = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [editGroup, setEditGroup]   = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [liveActive, setLiveActive] = useState(false);
  const [error, setError]           = useState('');

  const load = useCallback(async () => {
    try { const d = await api('/api/trip-groups'); setTripGroups(d); } catch(e){ console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLive = useCallback(() => {
    setLiveActive(true);
    load().then(() => setTimeout(() => setLiveActive(false), 2000));
  }, [load]);

  useSSE({ 'trip-groups-changed': handleLive, 'passengers-changed': handleLive, 'car-slots-changed': handleLive });

  const openNew = () => { setEditGroup(null); setForm(EMPTY_FORM); setError(''); setShowForm(true); };

  const openEdit = (g, e) => {
    e.stopPropagation();
    setEditGroup(g);
    setForm({
      transit_city:     g.transit_city || 'KWI',
      transit_date:     g.transit_date ? g.transit_date.slice(0,10) : '',
      direction:        g.direction || 'OUTBOUND',
      et_flight_number: g.et_flight_number || '',
      destination:      g.destination || '',
      checkin_date:     g.checkin_date ? g.checkin_date.slice(0,10) : '',
      checkin_time:     g.checkin_time ? g.checkin_time.slice(0,5) : '',
      requested_pax:    g.requested_pax || '',
      requester_pnr:    g.requester_pnr || '',
      requester_ticket: g.requester_ticket || '',
      status:           g.status || 'OPEN',
      demand_note:      g.demand_note || ''
    });
    setError(''); setShowForm(true);
  };

  const handleDelete = async (g, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete trip group "${g.transit_city} ${fmtDate(g.transit_date)}"?\nAll passengers will also be deleted.`)) return;
    try {
      await api(`/api/trip-groups/${g.id}`, { method: 'DELETE' });
      if (selected?.id === g.id) setSelected(null);
      load();
    } catch (err) { alert(err.message || 'Failed to delete'); }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.transit_date) { setError('Transit date is required'); return; }
    setSaving(true); setError('');
    try {
      const url    = editGroup ? `/api/trip-groups/${editGroup.id}` : '/api/trip-groups';
      const method = editGroup ? 'PUT' : 'POST';
      await api(url, { method, body: JSON.stringify({
        ...form,
        requested_pax: form.requested_pax ? Number(form.requested_pax) : null,
        et_flight_number: form.et_flight_number || null,
        destination: form.destination || null,
        checkin_date: form.checkin_date || null,
        checkin_time: form.checkin_time || null,
        requester_pnr: form.requester_pnr || null,
        requester_ticket: form.requester_ticket || null,
        demand_note: form.demand_note || null
      })});
      setShowForm(false); load();
    } catch (err) { setError(err.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

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
            {tripGroups.reduce((s,g)=>s+Number(g.requested_pax||0),0)}
          </div>
          <div className="stat-label">Requested Pax</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{tripGroups.reduce((s,g)=>s+Number(g.total_pax||0),0)}</div>
          <div className="stat-label">Booked Pax</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--et-gold-neon)',textShadow:'var(--glow-gold)'}}>
            {tripGroups.reduce((s,g)=>s+Number(g.car_slot_count||0),0)}
          </div>
          <div className="stat-label">Vehicles</div>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <div className="section-title">
            <div>
              <div className="card-title">✈ Trip Groups</div>
              <div className="card-subtitle">Create and manage transit coordination requests</div>
            </div>
            <span className={`live-dot${liveActive?' active':''}`}>
              <span className="live-dot-circle" /> LIVE
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
                  <select className="select" value={form.transit_city} onChange={e=>f('transit_city',e.target.value)}>
                    <option value="KWI">Kuwait (KWI)</option>
                    <option value="DXB">Dubai (DXB)</option>
                    <option value="DOH">Doha (DOH)</option>
                    <option value="BAH">Bahrain (BAH)</option>
                    <option value="RUH">Riyadh (RUH)</option>
                    <option value="JED">Jeddah (JED)</option>
                    <option value="MCT">Muscat (MCT)</option>
                    <option value="AUH">Abu Dhabi (AUH)</option>
                  </select>
                </div>
                <div className="form-field">
                  <label className="label">Transit Date *</label>
                  <input className="input" type="date" value={form.transit_date} onChange={e=>f('transit_date',e.target.value)} required />
                </div>
                <div className="form-field">
                  <label className="label">Direction</label>
                  <select className="select" value={form.direction} onChange={e=>f('direction',e.target.value)}>
                    <option value="OUTBOUND">Outbound (to airport)</option>
                    <option value="INBOUND">Inbound (from airport)</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label className="label">ET Flight Number</label>
                  <input className="input" placeholder="e.g. ET 308" value={form.et_flight_number} onChange={e=>f('et_flight_number',e.target.value)} />
                </div>
                <div className="form-field">
                  <label className="label">Destination</label>
                  <input className="input" placeholder="e.g. Addis Ababa (ADD)" value={form.destination} onChange={e=>f('destination',e.target.value)} />
                </div>
              </div>

              <div className="form-section-label">Check-in Details</div>
              <div className="form-row">
                <div className="form-field">
                  <label className="label">Check-in Date</label>
                  <input className="input" type="date" value={form.checkin_date} onChange={e=>f('checkin_date',e.target.value)} />
                </div>
                <div className="form-field">
                  <label className="label">Check-in Time</label>
                  <input className="input" type="time" value={form.checkin_time} onChange={e=>f('checkin_time',e.target.value)} />
                </div>
              </div>

              <div className="form-section-label">Requester Info</div>
              <div className="form-row">
                <div className="form-field">
                  <label className="label">Requested Pax Count</label>
                  <input className="input" type="number" min="1" placeholder="e.g. 12" value={form.requested_pax} onChange={e=>f('requested_pax',e.target.value)} />
                </div>
                <div className="form-field">
                  <label className="label">Requester PNR</label>
                  <input className="input" placeholder="e.g. ABC123" value={form.requester_pnr} onChange={e=>f('requester_pnr',e.target.value)} />
                </div>
                <div className="form-field">
                  <label className="label">Requester Ticket No.</label>
                  <input className="input" placeholder="e.g. 071-1234567890" value={form.requester_ticket} onChange={e=>f('requester_ticket',e.target.value)} />
                </div>
              </div>

              <div className="form-section-label">Status & Notes</div>
              <div className="form-row">
                <div className="form-field">
                  <label className="label">Status</label>
                  <select className="select" value={form.status} onChange={e=>f('status',e.target.value)}>
                    <option value="OPEN">Open</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="CLOSED">Closed</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="NOT_FEASIBLE">Not Feasible</option>
                  </select>
                </div>
                <div className="form-field" style={{flex:'2 1 260px'}}>
                  <label className="label">Demand Note</label>
                  <input className="input" placeholder="Any special notes…" value={form.demand_note} onChange={e=>f('demand_note',e.target.value)} />
                </div>
              </div>

              <div style={{display:'flex',gap:'10px',marginTop:'4px'}}>
                <button className="button" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : editGroup ? '✓ Update Group' : '+ Create Group'}
                </button>
                <button className="button ghost" type="button" onClick={()=>setShowForm(false)}>Cancel</button>
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
                  <th>Transit Date</th><th>City</th><th>Dir</th><th>Flight</th>
                  <th>Destination</th><th>Check-in</th>
                  <th>Req Pax</th><th>Booked Pax</th><th>Vehicles</th>
                  <th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tripGroups.map(tg => (
                  <tr key={tg.id} style={{cursor:'pointer'}} onClick={()=>setSelected(selected?.id===tg.id?null:tg)}>
                    <td style={{whiteSpace:'nowrap',fontWeight:500}}>{fmtDate(tg.transit_date)}</td>
                    <td><strong style={{color:'var(--text-main)'}}>{tg.transit_city}</strong></td>
                    <td>
                      <span style={{fontSize:11,fontWeight:700,color:tg.direction==='OUTBOUND'?'var(--et-green-neon)':'var(--et-gold-neon)'}}>
                        {tg.direction==='OUTBOUND'?'↑ OUT':'↓ IN'}
                      </span>
                    </td>
                    <td style={{color:'var(--et-green-neon)'}}>{tg.et_flight_number||'—'}</td>
                    <td>{tg.destination||'—'}</td>
                    <td style={{whiteSpace:'nowrap',fontSize:12,color:'var(--text-muted)'}}>
                      {tg.checkin_date ? fmtDate(tg.checkin_date) : '—'}
                      {tg.checkin_time ? <span style={{marginLeft:4}}>{tg.checkin_time.slice(0,5)}</span> : ''}
                    </td>
                    <td style={{color:'var(--et-gold-neon)',fontWeight:700}}>{tg.requested_pax||'—'}</td>
                    <td style={{fontWeight:600}}>{tg.total_pax||0}</td>
                    <td style={{color:'var(--et-gold-neon)'}}>{tg.car_slot_count||0}</td>
                    <td><span className={`badge ${STATUS_CLASS[tg.status]||'badge-open'}`}>{tg.status||'OPEN'}</span></td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div style={{display:'flex',gap:6}}>
                        <button className="button ghost" style={{padding:'5px 10px',fontSize:11}} onClick={e=>openEdit(tg,e)} title="Edit">✏</button>
                        <button className="button secondary" style={{padding:'5px 10px',fontSize:11}} onClick={e=>handleDelete(tg,e)} title="Delete">🗑</button>
                        <button className="button ghost" style={{padding:'5px 10px',fontSize:11}} onClick={()=>setSelected(tg)}>→</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <TripGroupDetail role="ET" tripGroup={selected} onClose={()=>setSelected(null)} onUpdated={load} />
      )}
    </div>
  );
}
