import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useSSE } from '../useSSE';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const fmtTime = t => t ? t.slice(0, 5) : '—';

/** Return a UTC date string yyyy-mm-dd for today + offsetDays */
function utcDateStr(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Format a yyyy-mm-dd string as dd/mm/yyyy */
const fmtDate = iso => {
  if (!iso) return '—';
  const [y, m, day] = iso.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};

function StatusBadge({ s }) {
  const map = {
    OPEN:      ['badge badge-open',       '● Open'],
    FULL:      ['badge badge-closed',     '⊘ Full'],
    COMPLETED: ['badge badge-completed',  '✓ Completed'],
    CANCELLED: ['badge badge-feasible',   '✕ Cancelled'],
  };
  const [cls, label] = map[s] || map.OPEN;
  return <span className={cls}>{label}</span>;
}

function PaymentBadge({ s }) {
  const map = {
    PAID:                ['badge badge-confirmed',  '✓ Paid'],
    ADVISED_TO_PAY:      ['badge badge-open',       '⚠ Advised to Pay'],
    AWAITING_FINAL_COST: ['badge badge-collecting', '⏳ Awaiting Cost'],
  };
  const [cls, label] = map[s] || map.AWAITING_FINAL_COST;
  return <span className={cls}>{b => b}{label}</span>;
}

/** Returns true if any passenger in the list has not fully paid */
function hasUnpaidPax(passengers) {
  return passengers.some(p => p.payment_status !== 'PAID');
}

/** Classifies unpaid severity: 'advised' if any are ADVISED_TO_PAY, else 'awaiting' */
function unpaidSeverity(passengers) {
  const unpaid = passengers.filter(p => p.payment_status !== 'PAID');
  if (unpaid.some(p => p.payment_status === 'ADVISED_TO_PAY')) return 'advised';
  return 'awaiting';
}

/* ── DailySummaryCard ─────────────────────────────────────────────────────── */
function DailySummaryCard({ slot, role }) {
  const [passengers, setPassengers] = useState([]);
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
    if (expanded) loadPax();
  }, [expanded, loadPax]);

  const unpaid     = passengers.filter(p => p.payment_status !== 'PAID');
  const severity   = unpaidSeverity(passengers);
  const alertColor = severity === 'advised' ? 'var(--et-gold-neon)' : 'var(--et-green-neon)';

  // Compute per-pax price
  const totalPrice = slot.total_vehicle_price_kwd ? Number(slot.total_vehicle_price_kwd) : null;
  const perPax     = totalPrice && booked > 0 ? (totalPrice / booked).toFixed(3) : null;
  const perPaxFallback = slot.per_pax_cost_kwd ? Number(slot.per_pax_cost_kwd).toFixed(3) : null;

  // Glow style based on unpaid status + vehicle status
  const hasUnpaid = expanded && unpaid.length > 0;
  const cardStyle = {
    background:   'rgba(4,12,6,0.92)',
    border:       hasUnpaid
                    ? `1px solid ${severity === 'advised' ? 'rgba(245,166,35,0.55)' : 'rgba(0,255,140,0.35)'}`
                    : slot.status === 'FULL'
                      ? '1px solid rgba(255,77,77,0.35)'
                      : '1px solid rgba(0,107,63,0.45)',
    borderRadius: 12,
    padding:      '16px 18px',
    marginBottom: 12,
    position:     'relative',
    overflow:     'hidden',
    cursor:       'pointer',
    transition:   'box-shadow 0.25s, border-color 0.25s',
    boxShadow:    hasUnpaid
                    ? severity === 'advised'
                      ? '0 0 18px rgba(245,166,35,0.22), 0 0 40px rgba(245,166,35,0.08)'
                      : '0 0 14px rgba(0,255,140,0.14)'
                    : slot.status === 'FULL'
                      ? '0 0 14px rgba(255,77,77,0.18)'
                      : 'none',
  };

  const accentColor = hasUnpaid
    ? severity === 'advised' ? 'var(--et-gold-neon)' : 'var(--et-green-neon)'
    : slot.status === 'FULL' ? 'var(--et-red-neon)'
    : slot.status === 'COMPLETED' ? 'var(--info)'
    : 'var(--et-green-neon)';

  const accentGlow = hasUnpaid
    ? severity === 'advised' ? 'var(--glow-gold)' : 'var(--glow-green)'
    : slot.status === 'FULL' ? 'var(--glow-red)' : 'var(--glow-green)';

  return (
    <div style={cardStyle} onClick={() => setExpanded(e => !e)}>
      {/* Left accent bar */}
      <div style={{
        position:'absolute', left:0, top:0, bottom:0, width:3,
        background: accentColor,
        boxShadow: accentGlow,
      }} />

      {/* Unpaid alert pulse ring */}
      {hasUnpaid && severity === 'advised' && (
        <div style={{
          position:'absolute', top:10, right:10,
          width:10, height:10, borderRadius:'50%',
          background:'var(--et-gold-neon)',
          boxShadow:'0 0 8px var(--et-gold-neon), 0 0 20px rgba(245,166,35,0.4)',
          animation:'live-pulse 1.1s ease-in-out infinite',
        }} />
      )}

      {/* Header row */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8,paddingLeft:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span style={{fontWeight:800,fontSize:15,color:'var(--text-main)'}}>
            {slot.vehicle_type}
          </span>
          <StatusBadge s={slot.status} />
          {(slot.transit_city || slot.tg_transit_city) && (
            <span style={{fontSize:12,background:'rgba(0,107,63,0.2)',border:'1px solid rgba(0,255,140,0.2)',borderRadius:4,padding:'2px 8px',color:'var(--et-green-neon)',fontWeight:600}}>
              {slot.transit_city || slot.tg_transit_city}
            </span>
          )}
          {slot.trip_group_id ? (
            <span style={{fontSize:11,color:'var(--text-muted)'}}>
              Group #{slot.trip_group_id}
              {slot.et_flight_number && ` · ${slot.et_flight_number}`}
            </span>
          ) : (
            <span style={{fontSize:11,background:'rgba(245,166,35,0.1)',border:'1px solid rgba(245,166,35,0.3)',borderRadius:4,padding:'2px 8px',color:'var(--et-gold-neon)'}}>Standalone</span>
          )}
        </div>

        {/* Price badge */}
        {(perPax || perPaxFallback) && (
          <span style={{fontSize:13,background:'rgba(245,166,35,0.12)',border:'1px solid rgba(245,166,35,0.35)',borderRadius:6,padding:'3px 10px',color:'var(--et-gold-neon)',fontWeight:700,boxShadow:'0 0 10px rgba(245,166,35,0.18)'}}>
            💰 {perPax ? `${perPax} KWD/pax` : `${perPaxFallback} KWD/pax`}
          </span>
        )}
      </div>

      {/* Details row */}
      <div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:10,fontSize:12,color:'var(--text-muted)',paddingLeft:8}}>
        <span style={{color: pct >= 100 ? 'var(--et-red-neon)' : pct >= 80 ? 'var(--warning)' : 'var(--et-green-neon)', fontWeight:700}}>
          🪑 {booked}/{total} seats ({pct}%)
        </span>
        {slot.pickup_time    && <span>📍 Pickup: <strong style={{color:'var(--text-main)'}}>{fmtTime(slot.pickup_time)}</strong></span>}
        {slot.departure_time && <span>🚀 Departs: <strong style={{color:'var(--text-main)'}}>{fmtTime(slot.departure_time)}</strong></span>}
        {slot.bag_limit_per_pax && <span>🧳 Max {slot.bag_limit_per_pax} bags/pax</span>}
        {slot.alsawan_note   && <span style={{color:'var(--et-gold-neon)'}}>💬 {slot.alsawan_note}</span>}
        {totalPrice && (
          <span style={{color:'var(--et-gold-neon)',fontWeight:600}}>
            Total: {totalPrice.toFixed(3)} KWD
          </span>
        )}
      </div>

      {/* Capacity bar */}
      <div style={{marginTop:10,paddingLeft:8}}>
        <div className="capacity-bar-track">
          <div
            className={`capacity-bar-fill ${pct >= 100 ? 'high' : pct >= 80 ? 'medium' : 'low'}`}
            style={{width: `${Math.min(pct, 100)}%`}}
          />
        </div>
      </div>

      {/* Unpaid warning banner */}
      {expanded && unpaid.length > 0 && (
        <div style={{
          marginTop:12, padding:'10px 14px', borderRadius:8,
          background: severity === 'advised' ? 'rgba(245,166,35,0.1)' : 'rgba(0,255,140,0.06)',
          border: severity === 'advised' ? '1px solid rgba(245,166,35,0.4)' : '1px solid rgba(0,255,140,0.25)',
          color: severity === 'advised' ? 'var(--et-gold-neon)' : 'var(--et-green-neon)',
          fontSize:12, fontWeight:600,
          boxShadow: severity === 'advised' ? '0 0 12px rgba(245,166,35,0.12)' : 'none',
        }}>
          {severity === 'advised'
            ? `⚠ ${unpaid.length} passenger group(s) advised to pay — follow up required`
            : `⏳ ${unpaid.length} passenger group(s) awaiting final cost confirmation`}
        </div>
      )}

      {/* Passenger table */}
      {expanded && (
        <div style={{marginTop:14,paddingLeft:8}} onClick={e => e.stopPropagation()}>
          {loading ? (
            <div style={{fontSize:12,color:'var(--text-muted)',padding:'8px 0'}}>Loading passengers…</div>
          ) : passengers.length === 0 ? (
            <div style={{fontSize:12,color:'var(--text-dim)',padding:'8px 0'}}>No passengers booked yet.</div>
          ) : (
            <>
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
                    const isUnpaid = p.payment_status !== 'PAID';
                    const rowStyle = isUnpaid
                      ? { background: p.payment_status === 'ADVISED_TO_PAY'
                            ? 'rgba(245,166,35,0.07)'
                            : 'transparent' }
                      : {};
                    return (
                      <tr key={p.id} style={rowStyle}>
                        <td style={{fontWeight:600}}>{p.name || '—'}</td>
                        <td style={{fontFamily:'monospace',color:'var(--et-green-neon)'}}>{p.pnr || '—'}</td>
                        <td style={{fontFamily:'monospace',fontSize:11,color:'var(--text-muted)'}}>{p.ticket_number || '—'}</td>
                        <td style={{textAlign:'center'}}>{p.pax_count}</td>
                        <td style={{textAlign:'center'}}>{p.bags_count ?? '—'}</td>
                        {role === 'ET' && (
                          <td>
                            <span className={
                              p.payment_status === 'PAID' ? 'badge badge-confirmed' :
                              p.payment_status === 'ADVISED_TO_PAY' ? 'badge badge-open' :
                              'badge badge-collecting'
                            }>
                              {p.payment_status === 'PAID' ? '✓ Paid' :
                               p.payment_status === 'ADVISED_TO_PAY' ? '⚠ Advised' :
                               '⏳ Awaiting'}
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

              {/* Summary footer */}
              <div style={{
                marginTop:10, display:'flex', gap:20, flexWrap:'wrap',
                padding:'10px 14px',
                background:'rgba(0,107,63,0.07)',
                border:'1px solid rgba(0,255,140,0.1)',
                borderRadius:8, fontSize:12, color:'var(--text-muted)'
              }}>
                <span>Total pax: <strong style={{color:'var(--text-main)'}}>{passengers.reduce((s,p) => s + p.pax_count, 0)}</strong></span>
                <span>Total bags: <strong style={{color:'var(--text-main)'}}>{passengers.reduce((s,p) => s + (p.bags_count || 0), 0)}</strong></span>
                {totalPrice && booked > 0 && (
                  <span style={{fontWeight:700,color:'var(--et-green-neon)'}}>
                    💰 {perPax} KWD/pax · {totalPrice.toFixed(3)} KWD total
                  </span>
                )}
                {unpaid.length > 0 && role === 'ET' && (
                  <span style={{color: severity === 'advised' ? 'var(--et-gold-neon)' : 'var(--text-muted)', fontWeight:600}}>
                    {unpaid.length} unpaid group(s)
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Expand hint */}
      <div style={{
        position:'absolute', bottom:8, right:14,
        fontSize:10, color:'var(--text-dim)', pointerEvents:'none',
      }}>
        {expanded ? '▲ collapse' : '▼ expand passengers'}
      </div>
    </div>
  );
}

/* ── DaySectionHeader ─────────────────────────────────────────────────────── */
function DaySectionHeader({ label, date, count, unpaidCount }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:14, marginBottom:14, marginTop:4,
    }}>
      <div style={{
        background:'linear-gradient(135deg, rgba(0,107,63,0.35) 0%, rgba(0,107,63,0.1) 100%)',
        border:'1px solid rgba(0,255,140,0.25)',
        borderRadius:10, padding:'10px 18px',
        boxShadow:'0 0 18px rgba(0,255,140,0.08)',
        flex:'0 0 auto',
      }}>
        <div style={{fontSize:18,fontWeight:800,color:'var(--et-green-neon)',textShadow:'var(--glow-green)',lineHeight:1}}>
          {label}
        </div>
        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>{fmtDate(date)}</div>
      </div>

      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{
          background:'rgba(0,107,63,0.12)', border:'1px solid rgba(0,255,140,0.2)',
          borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700,
          color:'var(--et-green-neon)',
        }}>
          🚌 {count} vehicle{count !== 1 ? 's' : ''}
        </span>
        {unpaidCount > 0 && (
          <span style={{
            background:'rgba(245,166,35,0.12)', border:'1px solid rgba(245,166,35,0.4)',
            borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700,
            color:'var(--et-gold-neon)',
            boxShadow:'0 0 10px rgba(245,166,35,0.18)',
            animation:'live-pulse 1.4s ease-in-out infinite',
          }}>
            ⚠ {unpaidCount} with unpaid pax
          </span>
        )}
      </div>

      <div style={{flex:1,height:1,background:'linear-gradient(90deg, rgba(0,255,140,0.25), transparent)'}} />
    </div>
  );
}

/* ── Main DailySummary component ──────────────────────────────────────────── */
export function DailySummary({ role }) {
  const [allSlots,   setAllSlots]   = useState([]);
  const [liveActive, setLiveActive] = useState(false);
  const [sseStatus,  setSseStatus]  = useState('connected');
  const [lastRefresh, setLastRefresh] = useState(null);

  const todayStr    = utcDateStr(0);
  const tomorrowStr = utcDateStr(1);

  const loadSlots = useCallback(async () => {
    try {
      const data = await api('/api/car-slots');
      setAllSlots(data);
      setLastRefresh(new Date());
    } catch (_) {}
  }, []);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const handleLive = useCallback(() => {
    setLiveActive(true);
    loadSlots().then(() => setTimeout(() => setLiveActive(false), 2000));
  }, [loadSlots]);

  useSSE(
    { 'car-slots-changed': handleLive, 'passengers-changed': handleLive },
    setSseStatus
  );

  // Filter to today and tomorrow only
  const todaySlots    = allSlots.filter(s => s.service_date?.slice(0, 10) === todayStr);
  const tomorrowSlots = allSlots.filter(s => s.service_date?.slice(0, 10) === tomorrowStr);
  const noDateSlots   = allSlots.filter(s => !s.service_date && role === 'ALSAWAN');

  // Count vehicles that have unpaid passengers (we approximate from slot-level data)
  // For the section header badge we use booked_pax > 0 as a proxy; exact counts come from expanded cards
  const todayUnpaidApprox    = todaySlots.filter(s => Number(s.booked_pax) > 0 && s.status !== 'COMPLETED').length;
  const tomorrowUnpaidApprox = tomorrowSlots.filter(s => Number(s.booked_pax) > 0 && s.status !== 'COMPLETED').length;

  const totalToday    = todaySlots.reduce((s, v) => s + Number(v.booked_pax || 0), 0);
  const totalTomorrow = tomorrowSlots.reduce((s, v) => s + Number(v.booked_pax || 0), 0);
  const totalSeatsToday    = todaySlots.reduce((s, v) => s + Number(v.total_seats || 0), 0);
  const totalSeatsTomorrow = tomorrowSlots.reduce((s, v) => s + Number(v.total_seats || 0), 0);

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="card" style={{marginBottom:18}}>
        <div className="section-header">
          <div className="section-title">
            <div>
              <div className="card-title">📅 Daily Vehicle Summary</div>
              <div className="card-subtitle">
                Today &amp; tomorrow's vehicles — click any card to see passengers
                {lastRefresh && (
                  <span style={{marginLeft:10,color:'var(--text-dim)'}}>
                    · Last updated {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
            <span className={`live-dot${sseStatus === 'reconnecting' ? ' reconnecting' : liveActive ? ' active' : ''}`}>
              <span className="live-dot-circle" />
              {sseStatus === 'reconnecting' ? 'RECONNECTING…' : 'LIVE'}
            </span>
          </div>
          <button className="button ghost" style={{fontSize:12}} onClick={loadSlots}>↺ Refresh</button>
        </div>

        {/* Summary stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value" style={{color:'var(--et-green-neon)',textShadow:'var(--glow-green)'}}>
              {todaySlots.length}
            </div>
            <div className="stat-label">Today's Vehicles</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{color:'var(--et-green-neon)',textShadow:'var(--glow-green)'}}>
              {totalToday}
            </div>
            <div className="stat-label">Today's Booked Pax</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{color:'var(--et-gold-neon)',textShadow:'var(--glow-gold)'}}>
              {tomorrowSlots.length}
            </div>
            <div className="stat-label">Tomorrow's Vehicles</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{color:'var(--et-gold-neon)',textShadow:'var(--glow-gold)'}}>
              {totalTomorrow}
            </div>
            <div className="stat-label">Tomorrow's Booked Pax</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{color:'var(--text-main)'}}>
              {totalSeatsToday + totalSeatsTomorrow - totalToday - totalTomorrow}
            </div>
            <div className="stat-label">Total Remaining Seats</div>
          </div>
        </div>
      </div>

      {/* ── Today ────────────────────────────────────────────────────────── */}
      {todaySlots.length > 0 ? (
        <div style={{marginBottom:28}}>
          <DaySectionHeader
            label="TODAY"
            date={todayStr}
            count={todaySlots.length}
            unpaidCount={todayUnpaidApprox}
          />
          {todaySlots.map(slot => (
            <DailySummaryCard key={slot.id} slot={slot} role={role} />
          ))}
        </div>
      ) : (
        <div style={{marginBottom:28}}>
          <DaySectionHeader label="TODAY" date={todayStr} count={0} unpaidCount={0} />
          <div className="empty-state" style={{padding:'28px 24px'}}>
            <div className="empty-state-icon">🚌</div>
            <div style={{fontWeight:600,marginBottom:4}}>No vehicles scheduled for today</div>
            <div style={{fontSize:12}}>Vehicles with today's service date will appear here</div>
          </div>
        </div>
      )}

      {/* ── Tomorrow ─────────────────────────────────────────────────────── */}
      {tomorrowSlots.length > 0 ? (
        <div style={{marginBottom:28}}>
          <DaySectionHeader
            label="TOMORROW"
            date={tomorrowStr}
            count={tomorrowSlots.length}
            unpaidCount={tomorrowUnpaidApprox}
          />
          {tomorrowSlots.map(slot => (
            <DailySummaryCard key={slot.id} slot={slot} role={role} />
          ))}
        </div>
      ) : (
        <div style={{marginBottom:28}}>
          <DaySectionHeader label="TOMORROW" date={tomorrowStr} count={0} unpaidCount={0} />
          <div className="empty-state" style={{padding:'28px 24px'}}>
            <div className="empty-state-icon">📅</div>
            <div style={{fontWeight:600,marginBottom:4}}>No vehicles scheduled for tomorrow</div>
            <div style={{fontSize:12}}>Vehicles with tomorrow's service date will appear here</div>
          </div>
        </div>
      )}

      {/* ── No-date vehicles (Alsawan only) ──────────────────────────────── */}
      {noDateSlots.length > 0 && (
        <div style={{marginBottom:28}}>
          <div style={{
            display:'flex', alignItems:'center', gap:14, marginBottom:14,
          }}>
            <div style={{
              background:'rgba(77,195,255,0.08)', border:'1px solid rgba(77,195,255,0.2)',
              borderRadius:10, padding:'10px 18px', flex:'0 0 auto',
            }}>
              <div style={{fontSize:15,fontWeight:800,color:'var(--info)',lineHeight:1}}>
                NO DATE SET
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>Undated vehicles</div>
            </div>
            <span style={{
              background:'rgba(77,195,255,0.08)', border:'1px solid rgba(77,195,255,0.2)',
              borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700, color:'var(--info)',
            }}>
              🚌 {noDateSlots.length} vehicle{noDateSlots.length !== 1 ? 's' : ''}
            </span>
            <div style={{flex:1,height:1,background:'linear-gradient(90deg, rgba(77,195,255,0.2), transparent)'}} />
          </div>
          {noDateSlots.map(slot => (
            <DailySummaryCard key={slot.id} slot={slot} role={role} />
          ))}
        </div>
      )}

      {/* ── All empty ────────────────────────────────────────────────────── */}
      {todaySlots.length === 0 && tomorrowSlots.length === 0 && noDateSlots.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div style={{fontWeight:600,marginBottom:6}}>No vehicles for today or tomorrow</div>
            <div style={{fontSize:12}}>
              {role === 'ALSAWAN'
                ? 'Add vehicles with a service date to see them here'
                : 'Alsawan will add vehicles with service dates that will appear here'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
