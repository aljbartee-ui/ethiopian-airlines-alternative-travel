import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const fmtTime = t => t ? t.slice(0, 5) : '—';

function utcDateStr(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const fmtDate = iso => {
  if (!iso) return '—';
  const [y, m, day] = iso.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};

/* ── small badge helpers ──────────────────────────────────────────────────── */
function SlotStatusBadge({ s }) {
  const map = {
    OPEN:      ['badge badge-open',      '● Open'],
    FULL:      ['badge badge-closed',    '⊘ Full'],
    COMPLETED: ['badge badge-completed', '✓ Completed'],
    CANCELLED: ['badge badge-feasible',  '✕ Cancelled'],
  };
  const [cls, label] = map[s] || map.OPEN;
  return <span className={cls}>{label}</span>;
}

function GroupStatusBadge({ s }) {
  const map = {
    OPEN:         ['badge badge-open',       '● Open'],
    CONFIRMED:    ['badge badge-confirmed',  '✓ Confirmed'],
    CLOSED:       ['badge badge-closed',     '⊘ Closed'],
    COMPLETED:    ['badge badge-completed',  '✓ Completed'],
    NOT_FEASIBLE: ['badge badge-feasible',   '✕ Not Feasible'],
  };
  const [cls, label] = map[s] || map.OPEN;
  return <span className={cls}>{label}</span>;
}

/* ── TripGroupCard ────────────────────────────────────────────────────────── */
function TripGroupCard({ group }) {
  const [passengers, setPassengers] = useState(null); // null = not loaded yet
  const [expanded,   setExpanded]   = useState(false);
  const [loading,    setLoading]    = useState(false);

  const noVehicle  = Number(group.car_slot_count || 0) === 0;
  const totalPax   = Number(group.total_pax || 0);

  const loadPax = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/api/trip-groups/${group.id}/passengers`);
      setPassengers(data);
    } catch (_) {}
    finally { setLoading(false); }
  }, [group.id]);

  useEffect(() => {
    if (expanded && passengers === null) loadPax();
  }, [expanded, passengers, loadPax]);

  // Derive unpaid info once passengers are loaded
  const unpaidPax   = passengers ? passengers.filter(p => p.payment_status !== 'PAID') : [];
  const hasAdvised  = unpaidPax.some(p => p.payment_status === 'ADVISED_TO_PAY');
  const hasUnpaid   = unpaidPax.length > 0;
  const unassigned  = passengers ? passengers.filter(p => !p.car_slot_id) : [];

  // Card border/glow based on warnings
  const borderColor = noVehicle
    ? 'rgba(255,77,77,0.5)'
    : hasAdvised
      ? 'rgba(245,166,35,0.5)'
      : hasUnpaid
        ? 'rgba(245,166,35,0.3)'
        : 'rgba(0,107,63,0.45)';

  const glowColor = noVehicle
    ? '0 0 18px rgba(255,77,77,0.18)'
    : hasAdvised
      ? '0 0 18px rgba(245,166,35,0.18)'
      : 'none';

  const accentColor = noVehicle
    ? 'var(--et-red-neon)'
    : hasAdvised
      ? 'var(--et-gold-neon)'
      : 'var(--et-green-neon)';

  const accentGlow = noVehicle
    ? 'var(--glow-red)'
    : hasAdvised
      ? 'var(--glow-gold)'
      : 'var(--glow-green)';

  return (
    <div
      style={{
        background:'rgba(4,12,6,0.92)',
        border:`1px solid ${borderColor}`,
        borderRadius:12, padding:'16px 18px', marginBottom:12,
        position:'relative', overflow:'hidden',
        cursor:'pointer', transition:'box-shadow 0.25s, border-color 0.25s',
        boxShadow: glowColor,
      }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Left accent bar */}
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:accentColor,boxShadow:accentGlow}} />

      {/* Pulse dot for no-vehicle or advised-to-pay */}
      {(noVehicle || hasAdvised) && (
        <div style={{
          position:'absolute', top:10, right:10,
          width:10, height:10, borderRadius:'50%',
          background: noVehicle ? 'var(--et-red-neon)' : 'var(--et-gold-neon)',
          boxShadow: noVehicle
            ? '0 0 8px var(--et-red-neon), 0 0 20px rgba(255,77,77,0.4)'
            : '0 0 8px var(--et-gold-neon), 0 0 20px rgba(245,166,35,0.4)',
          animation:'live-pulse 1.1s ease-in-out infinite',
        }} />
      )}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8,paddingLeft:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span style={{fontWeight:800,fontSize:15,color:'var(--text-main)'}}>
            ✈ Group #{group.id}
          </span>
          <GroupStatusBadge s={group.status} />
          <span style={{fontSize:12,background:'rgba(0,107,63,0.2)',border:'1px solid rgba(0,255,140,0.2)',borderRadius:4,padding:'2px 8px',color:'var(--et-green-neon)',fontWeight:600}}>
            {group.transit_city}
          </span>
          {group.et_flight_number && (
            <span style={{fontSize:12,color:'var(--text-muted)'}}>
              {group.direction === 'OUTBOUND' ? '→' : '←'} {group.et_flight_number}
            </span>
          )}
          {group.destination && (
            <span style={{fontSize:12,color:'var(--text-muted)'}}>to {group.destination}</span>
          )}
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {noVehicle && (
            <span style={{
              fontSize:11,fontWeight:700,
              background:'rgba(255,77,77,0.12)',border:'1px solid rgba(255,77,77,0.45)',
              borderRadius:6,padding:'3px 10px',color:'var(--et-red-neon)',
              boxShadow:'0 0 10px rgba(255,77,77,0.18)',
            }}>
              ⚠ No Vehicle Assigned
            </span>
          )}
          {!noVehicle && (
            <span style={{fontSize:11,color:'var(--text-muted)'}}>
              🚌 {group.car_slot_count} vehicle{group.car_slot_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Details row */}
      <div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:10,fontSize:12,color:'var(--text-muted)',paddingLeft:8}}>
        <span>
          👥 <strong style={{color: totalPax > 0 ? 'var(--text-main)' : 'var(--text-dim)'}}>
            {totalPax} pax booked
          </strong>
          {group.requested_pax && ` / ${group.requested_pax} requested`}
        </span>
        {group.checkin_date && (
          <span>📅 Check-in: <strong style={{color:'var(--text-main)'}}>{fmtDate(group.checkin_date)}</strong></span>
        )}
        {group.checkin_time && (
          <span>🕐 <strong style={{color:'var(--text-main)'}}>{fmtTime(group.checkin_time)}</strong></span>
        )}
        {group.demand_note && (
          <span style={{color:'var(--et-gold-neon)'}}>💬 {group.demand_note}</span>
        )}
      </div>

      {/* Inline warning banners — always visible, no need to expand */}
      <div style={{paddingLeft:8}}>
        {noVehicle && (
          <div style={{
            marginTop:10, padding:'9px 14px', borderRadius:8,
            background:'rgba(255,77,77,0.09)', border:'1px solid rgba(255,77,77,0.35)',
            color:'var(--et-red-neon)', fontSize:12, fontWeight:600,
            boxShadow:'0 0 10px rgba(255,77,77,0.1)',
          }}>
            🚨 This group has no vehicle assigned — Alsawan needs to add a vehicle for this date
          </div>
        )}
      </div>

      {/* Expanded passenger section */}
      {expanded && (
        <div style={{marginTop:14,paddingLeft:8}} onClick={e => e.stopPropagation()}>
          {loading ? (
            <div style={{fontSize:12,color:'var(--text-muted)',padding:'8px 0'}}>Loading passengers…</div>
          ) : passengers && passengers.length === 0 ? (
            <div style={{
              fontSize:12,color:'var(--text-dim)',padding:'10px 14px',
              background:'rgba(0,107,63,0.05)',border:'1px solid rgba(0,107,63,0.15)',
              borderRadius:8,
            }}>
              No passengers added to this group yet.
            </div>
          ) : passengers && passengers.length > 0 ? (
            <>
              {/* Unpaid warning banner */}
              {hasUnpaid && (
                <div style={{
                  marginBottom:10, padding:'9px 14px', borderRadius:8,
                  background: hasAdvised ? 'rgba(245,166,35,0.09)' : 'rgba(0,107,63,0.07)',
                  border: hasAdvised ? '1px solid rgba(245,166,35,0.4)' : '1px solid rgba(0,255,140,0.2)',
                  color: hasAdvised ? 'var(--et-gold-neon)' : 'var(--et-green-neon)',
                  fontSize:12, fontWeight:600,
                  boxShadow: hasAdvised ? '0 0 10px rgba(245,166,35,0.1)' : 'none',
                }}>
                  {hasAdvised
                    ? `⚠ ${unpaidPax.length} passenger group(s) advised to pay — follow up required`
                    : `⏳ ${unpaidPax.length} passenger group(s) awaiting final cost confirmation`}
                </div>
              )}

              {/* Unassigned warning */}
              {unassigned.length > 0 && (
                <div style={{
                  marginBottom:10, padding:'9px 14px', borderRadius:8,
                  background:'rgba(255,77,77,0.07)', border:'1px solid rgba(255,77,77,0.3)',
                  color:'var(--et-red-neon)', fontSize:12, fontWeight:600,
                }}>
                  🚨 {unassigned.length} passenger group(s) not assigned to any vehicle
                </div>
              )}

              <div style={{fontSize:11,fontWeight:700,color:'var(--et-gold-neon)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>
                Passengers
              </div>
              <table className="table" style={{fontSize:12}}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>PNR</th>
                    <th>Ticket</th>
                    <th>Pax</th>
                    <th>Bags</th>
                    <th>Vehicle</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {passengers.map(p => {
                    const isAdvised  = p.payment_status === 'ADVISED_TO_PAY';
                    const isAwaiting = p.payment_status === 'AWAITING_FINAL_COST';
                    const noSlot     = !p.car_slot_id;
                    const rowBg = noSlot
                      ? 'rgba(255,77,77,0.06)'
                      : isAdvised
                        ? 'rgba(245,166,35,0.06)'
                        : 'transparent';
                    return (
                      <tr key={p.id} style={{background:rowBg}}>
                        <td style={{fontWeight:600}}>{p.name || '—'}</td>
                        <td style={{fontFamily:'monospace',color:'var(--et-green-neon)'}}>{p.pnr || '—'}</td>
                        <td style={{fontFamily:'monospace',fontSize:11,color:'var(--text-muted)'}}>{p.ticket_number || '—'}</td>
                        <td style={{textAlign:'center'}}>{p.pax_count}</td>
                        <td style={{textAlign:'center'}}>{p.bags_count ?? '—'}</td>
                        <td>
                          {p.car_vehicle_type
                            ? <span style={{fontSize:11,color:'var(--et-green-neon)',fontWeight:600}}>{p.car_vehicle_type}</span>
                            : <span style={{fontSize:11,color:'var(--et-red-neon)',fontWeight:700}}>⚠ Unassigned</span>}
                        </td>
                        <td>
                          <span className={
                            p.payment_status === 'PAID' ? 'badge badge-confirmed' :
                            isAdvised ? 'badge badge-open' : 'badge badge-collecting'
                          }>
                            {p.payment_status === 'PAID' ? '✓ Paid' :
                             isAdvised ? '⚠ Advised' : '⏳ Awaiting'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer */}
              <div style={{
                marginTop:10, display:'flex', gap:20, flexWrap:'wrap',
                padding:'10px 14px',
                background:'rgba(0,107,63,0.07)', border:'1px solid rgba(0,255,140,0.1)',
                borderRadius:8, fontSize:12, color:'var(--text-muted)',
              }}>
                <span>Total pax: <strong style={{color:'var(--text-main)'}}>{passengers.reduce((s,p) => s + Number(p.pax_count || 0), 0)}</strong></span>
                <span>Total bags: <strong style={{color:'var(--text-main)'}}>{passengers.reduce((s,p) => s + Number(p.bags_count || 0), 0)}</strong></span>
                {unassigned.length > 0 && (
                  <span style={{color:'var(--et-red-neon)',fontWeight:600}}>
                    🚨 {unassigned.length} unassigned
                  </span>
                )}
                {hasUnpaid && (
                  <span style={{color: hasAdvised ? 'var(--et-gold-neon)' : 'var(--text-muted)', fontWeight:600}}>
                    {unpaidPax.length} unpaid group(s)
                  </span>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Expand hint */}
      <div style={{position:'absolute',bottom:8,right:14,fontSize:10,color:'var(--text-dim)',pointerEvents:'none'}}>
        {expanded ? '▲ collapse' : '▼ expand passengers'}
      </div>
    </div>
  );
}

/* ── VehicleCard ──────────────────────────────────────────────────────────── */
function VehicleCard({ slot, role }) {
  const [passengers, setPassengers] = useState(null);
  const [expanded,   setExpanded]   = useState(false);
  const [loading,    setLoading]    = useState(false);

  const booked = Number(slot.booked_pax || 0);
  const total  = Number(slot.total_seats || 0);
  const pct    = total > 0 ? Math.round((booked / total) * 100) : 0;

  const loadPax = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/api/car-slots/${slot.id}/passengers`);
      setPassengers(data);
    } catch (_) {}
    finally { setLoading(false); }
  }, [slot.id]);

  useEffect(() => {
    if (expanded && passengers === null) loadPax();
  }, [expanded, passengers, loadPax]);

  const unpaid    = passengers ? passengers.filter(p => p.payment_status !== 'PAID') : [];
  const hasAdvised = unpaid.some(p => p.payment_status === 'ADVISED_TO_PAY');
  const hasUnpaid  = unpaid.length > 0;

  const totalPrice = slot.total_vehicle_price_kwd ? Number(slot.total_vehicle_price_kwd) : null;
  const perPax     = totalPrice && booked > 0 ? (totalPrice / booked).toFixed(3) : null;
  const perPaxFallback = slot.per_pax_cost_kwd ? Number(slot.per_pax_cost_kwd).toFixed(3) : null;

  const borderColor = hasAdvised
    ? 'rgba(245,166,35,0.5)'
    : hasUnpaid
      ? 'rgba(245,166,35,0.3)'
      : slot.status === 'FULL'
        ? 'rgba(255,77,77,0.35)'
        : 'rgba(0,107,63,0.45)';

  const accentColor = hasAdvised
    ? 'var(--et-gold-neon)'
    : slot.status === 'FULL' ? 'var(--et-red-neon)'
    : slot.status === 'COMPLETED' ? 'var(--info)'
    : 'var(--et-green-neon)';

  const accentGlow = hasAdvised
    ? 'var(--glow-gold)'
    : slot.status === 'FULL' ? 'var(--glow-red)' : 'var(--glow-green)';

  return (
    <div
      style={{
        background:'rgba(4,12,6,0.92)',
        border:`1px solid ${borderColor}`,
        borderRadius:12, padding:'16px 18px', marginBottom:12,
        position:'relative', overflow:'hidden',
        cursor:'pointer', transition:'box-shadow 0.25s, border-color 0.25s',
        boxShadow: hasAdvised ? '0 0 18px rgba(245,166,35,0.18)' : slot.status === 'FULL' ? '0 0 14px rgba(255,77,77,0.18)' : 'none',
      }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Left accent bar */}
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:accentColor,boxShadow:accentGlow}} />

      {/* Pulse dot */}
      {hasAdvised && (
        <div style={{
          position:'absolute', top:10, right:10,
          width:10, height:10, borderRadius:'50%',
          background:'var(--et-gold-neon)',
          boxShadow:'0 0 8px var(--et-gold-neon), 0 0 20px rgba(245,166,35,0.4)',
          animation:'live-pulse 1.1s ease-in-out infinite',
        }} />
      )}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8,paddingLeft:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span style={{fontWeight:800,fontSize:15,color:'var(--text-main)'}}>{slot.vehicle_type}</span>
          <SlotStatusBadge s={slot.status} />
          {(slot.transit_city || slot.tg_transit_city) && (
            <span style={{fontSize:12,background:'rgba(0,107,63,0.2)',border:'1px solid rgba(0,255,140,0.2)',borderRadius:4,padding:'2px 8px',color:'var(--et-green-neon)',fontWeight:600}}>
              {slot.transit_city || slot.tg_transit_city}
            </span>
          )}
          {slot.trip_group_id
            ? <span style={{fontSize:11,color:'var(--text-muted)'}}>Group #{slot.trip_group_id}{slot.et_flight_number && ` · ${slot.et_flight_number}`}</span>
            : <span style={{fontSize:11,background:'rgba(245,166,35,0.1)',border:'1px solid rgba(245,166,35,0.3)',borderRadius:4,padding:'2px 8px',color:'var(--et-gold-neon)'}}>Standalone</span>
          }
        </div>
        {(perPax || perPaxFallback) && (
          <span style={{fontSize:13,background:'rgba(245,166,35,0.12)',border:'1px solid rgba(245,166,35,0.35)',borderRadius:6,padding:'3px 10px',color:'var(--et-gold-neon)',fontWeight:700,boxShadow:'0 0 10px rgba(245,166,35,0.18)'}}>
            💰 {perPax ? `${perPax} KWD/pax` : `${perPaxFallback} KWD/pax`}
          </span>
        )}
      </div>

      {/* Details */}
      <div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:10,fontSize:12,color:'var(--text-muted)',paddingLeft:8}}>
        <span style={{color: pct >= 100 ? 'var(--et-red-neon)' : pct >= 80 ? 'var(--warning)' : 'var(--et-green-neon)', fontWeight:700}}>
          🪑 {booked}/{total} seats ({pct}%)
        </span>
        {slot.pickup_time    && <span>📍 Pickup: <strong style={{color:'var(--text-main)'}}>{fmtTime(slot.pickup_time)}</strong></span>}
        {slot.departure_time && <span>🚀 Departs: <strong style={{color:'var(--text-main)'}}>{fmtTime(slot.departure_time)}</strong></span>}
        {slot.bag_limit_per_pax && <span>🧳 Max {slot.bag_limit_per_pax} bags/pax</span>}
        {slot.alsawan_note   && <span style={{color:'var(--et-gold-neon)'}}>💬 {slot.alsawan_note}</span>}
        {totalPrice && <span style={{color:'var(--et-gold-neon)',fontWeight:600}}>Total: {totalPrice.toFixed(3)} KWD</span>}
      </div>

      {/* Capacity bar */}
      <div style={{marginTop:10,paddingLeft:8}}>
        <div className="capacity-bar-track">
          <div className={`capacity-bar-fill ${pct >= 100 ? 'high' : pct >= 80 ? 'medium' : 'low'}`} style={{width:`${Math.min(pct,100)}%`}} />
        </div>
      </div>

      {/* Expanded passengers */}
      {expanded && (
        <div style={{marginTop:14,paddingLeft:8}} onClick={e => e.stopPropagation()}>
          {loading ? (
            <div style={{fontSize:12,color:'var(--text-muted)',padding:'8px 0'}}>Loading passengers…</div>
          ) : passengers && passengers.length === 0 ? (
            <div style={{fontSize:12,color:'var(--text-dim)',padding:'8px 0'}}>No passengers booked yet.</div>
          ) : passengers && passengers.length > 0 ? (
            <>
              {hasUnpaid && (
                <div style={{
                  marginBottom:10, padding:'9px 14px', borderRadius:8,
                  background: hasAdvised ? 'rgba(245,166,35,0.09)' : 'rgba(0,107,63,0.07)',
                  border: hasAdvised ? '1px solid rgba(245,166,35,0.4)' : '1px solid rgba(0,255,140,0.2)',
                  color: hasAdvised ? 'var(--et-gold-neon)' : 'var(--et-green-neon)',
                  fontSize:12, fontWeight:600,
                  boxShadow: hasAdvised ? '0 0 10px rgba(245,166,35,0.1)' : 'none',
                }}>
                  {hasAdvised
                    ? `⚠ ${unpaid.length} passenger group(s) advised to pay — follow up required`
                    : `⏳ ${unpaid.length} passenger group(s) awaiting final cost confirmation`}
                </div>
              )}
              <div style={{fontSize:11,fontWeight:700,color:'var(--et-gold-neon)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>
                Passengers
              </div>
              <table className="table" style={{fontSize:12}}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>PNR</th>
                    <th>Ticket</th>
                    <th>Pax</th>
                    <th>Bags</th>
                    {role === 'ET' && <th>Payment</th>}
                    {perPax && role === 'ET' && <th>Cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {passengers.map(p => {
                    const isAdvised2 = p.payment_status === 'ADVISED_TO_PAY';
                    return (
                      <tr key={p.id} style={{background: isAdvised2 ? 'rgba(245,166,35,0.06)' : 'transparent'}}>
                        <td style={{fontWeight:600}}>{p.name || '—'}</td>
                        <td style={{fontFamily:'monospace',color:'var(--et-green-neon)'}}>{p.pnr || '—'}</td>
                        <td style={{fontFamily:'monospace',fontSize:11,color:'var(--text-muted)'}}>{p.ticket_number || '—'}</td>
                        <td style={{textAlign:'center'}}>{p.pax_count}</td>
                        <td style={{textAlign:'center'}}>{p.bags_count ?? '—'}</td>
                        {role === 'ET' && (
                          <td>
                            <span className={p.payment_status === 'PAID' ? 'badge badge-confirmed' : isAdvised2 ? 'badge badge-open' : 'badge badge-collecting'}>
                              {p.payment_status === 'PAID' ? '✓ Paid' : isAdvised2 ? '⚠ Advised' : '⏳ Awaiting'}
                            </span>
                          </td>
                        )}
                        {perPax && role === 'ET' && (
                          <td style={{color:'var(--et-gold-neon)',fontWeight:700}}>
                            {(Number(perPax) * p.pax_count).toFixed(3)} KWD
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{marginTop:10,display:'flex',gap:20,flexWrap:'wrap',padding:'10px 14px',background:'rgba(0,107,63,0.07)',border:'1px solid rgba(0,255,140,0.1)',borderRadius:8,fontSize:12,color:'var(--text-muted)'}}>
                <span>Total pax: <strong style={{color:'var(--text-main)'}}>{passengers.reduce((s,p) => s + Number(p.pax_count||0), 0)}</strong></span>
                <span>Total bags: <strong style={{color:'var(--text-main)'}}>{passengers.reduce((s,p) => s + Number(p.bags_count||0), 0)}</strong></span>
                {totalPrice && booked > 0 && (
                  <span style={{fontWeight:700,color:'var(--et-green-neon)'}}>💰 {perPax} KWD/pax · {totalPrice.toFixed(3)} KWD total</span>
                )}
                {hasUnpaid && role === 'ET' && (
                  <span style={{color: hasAdvised ? 'var(--et-gold-neon)' : 'var(--text-muted)',fontWeight:600}}>
                    {unpaid.length} unpaid group(s)
                  </span>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      <div style={{position:'absolute',bottom:8,right:14,fontSize:10,color:'var(--text-dim)',pointerEvents:'none'}}>
        {expanded ? '▲ collapse' : '▼ expand passengers'}
      </div>
    </div>
  );
}

/* ── Section divider ──────────────────────────────────────────────────────── */
function SectionLabel({ icon, label, date, count, badge, badgeColor, badgeGlow }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14,marginTop:4}}>
      <div style={{
        background:'linear-gradient(135deg, rgba(0,107,63,0.35) 0%, rgba(0,107,63,0.1) 100%)',
        border:'1px solid rgba(0,255,140,0.25)',
        borderRadius:10, padding:'10px 18px', flex:'0 0 auto',
        boxShadow:'0 0 18px rgba(0,255,140,0.08)',
      }}>
        <div style={{fontSize:16,fontWeight:800,color:'var(--et-green-neon)',textShadow:'var(--glow-green)',lineHeight:1}}>
          {icon} {label}
        </div>
        {date && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>{fmtDate(date)}</div>}
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        {count !== undefined && (
          <span style={{background:'rgba(0,107,63,0.12)',border:'1px solid rgba(0,255,140,0.2)',borderRadius:20,padding:'4px 12px',fontSize:12,fontWeight:700,color:'var(--et-green-neon)'}}>
            {count} item{count !== 1 ? 's' : ''}
          </span>
        )}
        {badge && (
          <span style={{
            background: badgeColor ? `${badgeColor}18` : 'rgba(245,166,35,0.12)',
            border: `1px solid ${badgeColor || 'rgba(245,166,35,0.4)'}`,
            borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700,
            color: badgeColor || 'var(--et-gold-neon)',
            boxShadow: badgeGlow || '0 0 10px rgba(245,166,35,0.18)',
            animation:'live-pulse 1.4s ease-in-out infinite',
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{flex:1,height:1,background:'linear-gradient(90deg, rgba(0,255,140,0.25), transparent)'}} />
    </div>
  );
}

/* ── Main DailySummary ────────────────────────────────────────────────────── */
export function DailySummary({ role }) {
  const [allSlots,    setAllSlots]    = useState([]);
  const [allGroups,   setAllGroups]   = useState([]);
  const [liveActive,  setLiveActive]  = useState(false);
  const [sseStatus,   setSseStatus]   = useState('connected');
  const [lastRefresh, setLastRefresh] = useState(null);

  const todayStr    = utcDateStr(0);
  const tomorrowStr = utcDateStr(1);

  const loadAll = useCallback(async () => {
    try {
      const [slots, groups] = await Promise.all([
        api('/api/car-slots'),
        api('/api/trip-groups'),
      ]);
      setAllSlots(slots);
      setAllGroups(groups);
      setLastRefresh(new Date());
    } catch (_) {}
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleLive = useCallback(() => {
    setLiveActive(true);
    loadAll().then(() => setTimeout(() => setLiveActive(false), 2000));
  }, [loadAll]);

  useSSE(
    { 'car-slots-changed': handleLive, 'passengers-changed': handleLive, 'trip-groups-changed': handleLive },
    setSseStatus
  );

  // ── Filter groups by checkin_date (the day passengers actually board the bus) ─
  const todayGroups    = allGroups.filter(g => g.checkin_date?.slice(0,10) === todayStr);
  const tomorrowGroups = allGroups.filter(g => g.checkin_date?.slice(0,10) === tomorrowStr);

  // Groups with no vehicle assigned
  const todayNoVehicle    = todayGroups.filter(g => Number(g.car_slot_count || 0) === 0);
  const tomorrowNoVehicle = tomorrowGroups.filter(g => Number(g.car_slot_count || 0) === 0);

  // ── Filter vehicles by service_date ───────────────────────────────────────
  const todaySlots    = allSlots.filter(s => s.service_date?.slice(0,10) === todayStr);
  const tomorrowSlots = allSlots.filter(s => s.service_date?.slice(0,10) === tomorrowStr);
  const noDateSlots   = allSlots.filter(s => !s.service_date);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalPaxToday    = todayGroups.reduce((s,g) => s + Number(g.total_pax||0), 0);
  const totalPaxTomorrow = tomorrowGroups.reduce((s,g) => s + Number(g.total_pax||0), 0);
  const seatsToday       = todaySlots.reduce((s,v) => s + Number(v.total_seats||0), 0);
  const seatsTomorrow    = tomorrowSlots.reduce((s,v) => s + Number(v.total_seats||0), 0);
  const bookedToday      = todaySlots.reduce((s,v) => s + Number(v.booked_pax||0), 0);
  const bookedTomorrow   = tomorrowSlots.reduce((s,v) => s + Number(v.booked_pax||0), 0);
  const noVehicleTotal   = todayNoVehicle.length + tomorrowNoVehicle.length;

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="card" style={{marginBottom:18}}>
        <div className="section-header">
          <div className="section-title">
            <div>
              <div className="card-title">📅 Daily Summary</div>
              <div className="card-subtitle">
                Today &amp; tomorrow — ET trip groups and vehicles with passengers
                {lastRefresh && (
                  <span style={{marginLeft:10,color:'var(--text-dim)'}}>
                    · Updated {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
            <span className={`live-dot${sseStatus==='reconnecting'?' reconnecting':liveActive?' active':''}`}>
              <span className="live-dot-circle" />
              {sseStatus === 'reconnecting' ? 'RECONNECTING…' : 'LIVE'}
            </span>
          </div>
          <button className="button ghost" style={{fontSize:12}} onClick={loadAll}>↺ Refresh</button>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value" style={{color:'var(--et-green-neon)',textShadow:'var(--glow-green)'}}>{todayGroups.length}</div>
            <div className="stat-label">Today's Check-ins</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{color:'var(--et-green-neon)',textShadow:'var(--glow-green)'}}>{totalPaxToday}</div>
            <div className="stat-label">Today's Pax</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{color:'var(--et-gold-neon)',textShadow:'var(--glow-gold)'}}>{tomorrowGroups.length}</div>
            <div className="stat-label">Tomorrow's Check-ins</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{color:'var(--et-gold-neon)',textShadow:'var(--glow-gold)'}}>{totalPaxTomorrow}</div>
            <div className="stat-label">Tomorrow's Pax</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{color:'var(--text-main)'}}>{seatsToday + seatsTomorrow - bookedToday - bookedTomorrow}</div>
            <div className="stat-label">Remaining Seats</div>
          </div>
          {noVehicleTotal > 0 && (
            <div className="stat-card" style={{border:'1px solid rgba(255,77,77,0.4)',boxShadow:'0 0 12px rgba(255,77,77,0.12)'}}>
              <div className="stat-value" style={{color:'var(--et-red-neon)',textShadow:'var(--glow-red)'}}>{noVehicleTotal}</div>
              <div className="stat-label" style={{color:'var(--et-red-neon)'}}>Groups w/o Vehicle</div>
            </div>
          )}
        </div>

        {/* Top-level no-vehicle alert */}
        {noVehicleTotal > 0 && (
          <div style={{
            padding:'11px 16px', borderRadius:9,
            background:'rgba(255,77,77,0.08)', border:'1px solid rgba(255,77,77,0.35)',
            color:'var(--et-red-neon)', fontSize:13, fontWeight:600,
            boxShadow:'0 0 14px rgba(255,77,77,0.1)',
          }}>
            🚨 {noVehicleTotal} trip group{noVehicleTotal !== 1 ? 's' : ''} have no vehicle assigned — Alsawan needs to add vehicles
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TODAY                                                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* Today ET Trip Groups */}
      <SectionLabel
        icon="TODAY"
        label="— ET Trip Groups"
        date={todayStr}
        count={todayGroups.length}
        badge={todayNoVehicle.length > 0 ? `🚨 ${todayNoVehicle.length} without vehicle` : null}
        badgeColor="rgba(255,77,77,0.8)"
        badgeGlow="0 0 10px rgba(255,77,77,0.2)"
      />
      {todayGroups.length === 0 ? (
        <div className="empty-state" style={{padding:'20px 24px',marginBottom:18}}>
          <div className="empty-state-icon">✈</div>
          <div style={{fontWeight:600,marginBottom:4}}>No ET trip groups checking in today</div>
        </div>
      ) : (
        <div style={{marginBottom:18}}>
          {todayGroups.map(g => <TripGroupCard key={g.id} group={g} />)}
        </div>
      )}

      {/* Today Vehicles */}
      <SectionLabel
        icon="TODAY"
        label="— Vehicles"
        date={todayStr}
        count={todaySlots.length}
      />
      {todaySlots.length === 0 ? (
        <div className="empty-state" style={{padding:'20px 24px',marginBottom:28}}>
          <div className="empty-state-icon">🚌</div>
          <div style={{fontWeight:600,marginBottom:4}}>No vehicles scheduled for today</div>
        </div>
      ) : (
        <div style={{marginBottom:28}}>
          {todaySlots.map(s => <VehicleCard key={s.id} slot={s} role={role} />)}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TOMORROW                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* Tomorrow ET Trip Groups */}
      <SectionLabel
        icon="TOMORROW"
        label="— ET Trip Groups"
        date={tomorrowStr}
        count={tomorrowGroups.length}
        badge={tomorrowNoVehicle.length > 0 ? `🚨 ${tomorrowNoVehicle.length} without vehicle` : null}
        badgeColor="rgba(255,77,77,0.8)"
        badgeGlow="0 0 10px rgba(255,77,77,0.2)"
      />
      {tomorrowGroups.length === 0 ? (
        <div className="empty-state" style={{padding:'20px 24px',marginBottom:18}}>
          <div className="empty-state-icon">✈</div>
          <div style={{fontWeight:600,marginBottom:4}}>No ET trip groups checking in tomorrow</div>
        </div>
      ) : (
        <div style={{marginBottom:18}}>
          {tomorrowGroups.map(g => <TripGroupCard key={g.id} group={g} />)}
        </div>
      )}

      {/* Tomorrow Vehicles */}
      <SectionLabel
        icon="TOMORROW"
        label="— Vehicles"
        date={tomorrowStr}
        count={tomorrowSlots.length}
      />
      {tomorrowSlots.length === 0 ? (
        <div className="empty-state" style={{padding:'20px 24px',marginBottom:28}}>
          <div className="empty-state-icon">🚌</div>
          <div style={{fontWeight:600,marginBottom:4}}>No vehicles scheduled for tomorrow</div>
        </div>
      ) : (
        <div style={{marginBottom:28}}>
          {tomorrowSlots.map(s => <VehicleCard key={s.id} slot={s} role={role} />)}
        </div>
      )}

      {/* ── No-date vehicles (shown to both roles) ───────────────────────── */}
      {noDateSlots.length > 0 && (
        <div style={{marginBottom:28}}>
          <SectionLabel icon="📋" label="Undated Vehicles" count={noDateSlots.length} />
          {noDateSlots.map(s => <VehicleCard key={s.id} slot={s} role={role} />)}
        </div>
      )}

      {/* ── Fully empty ──────────────────────────────────────────────────── */}
      {todayGroups.length === 0 && tomorrowGroups.length === 0 &&
       todaySlots.length === 0 && tomorrowSlots.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div style={{fontWeight:600,marginBottom:6}}>Nothing scheduled for today or tomorrow</div>
            <div style={{fontSize:12}}>
              {role === 'ALSAWAN'
                ? 'ET trip groups with a check-in date and vehicles with a service date for today/tomorrow will appear here'
                : 'Your trip groups with a check-in date and Alsawan vehicles for today/tomorrow will appear here'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
