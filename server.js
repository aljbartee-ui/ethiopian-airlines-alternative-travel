import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());

// ── Database ──────────────────────────────────────────────────────────────────
import pg from 'pg';
const { Pool } = pg;

const sslConfig = process.env.DATABASE_URL?.includes('localhost')
  ? false
  : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig || undefined
});

// ── SSE broadcast ─────────────────────────────────────────────────────────────
const sseClients = new Set();

function broadcastUpdate(event, data = {}) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch (_) { sseClients.delete(client); }
  }
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ── Auth ──────────────────────────────────────────────────────────────────────
const ET_PASSWORD      = process.env.ET_PASSWORD;
const ALSAWAN_PASSWORD = process.env.ALSAWAN_PASSWORD;

function getRole(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token === 'ET' || token === 'ALSAWAN') return token;
  return null;
}

function requireRole(role) {
  return (req, res, next) => {
    const r = getRole(req);
    if (!r) return res.status(401).json({ error: 'Unauthorized' });
    if (role && r !== role) return res.status(403).json({ error: 'Forbidden' });
    req.role = r;
    next();
  };
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  let role = null;
  if (ET_PASSWORD && password === ET_PASSWORD) role = 'ET';
  if (ALSAWAN_PASSWORD && password === ALSAWAN_PASSWORD) role = 'ALSAWAN';
  if (!role) return res.status(401).json({ error: 'Invalid password' });
  return res.json({ role, token: role });
});

app.post('/api/logout', (_req, res) => res.json({ ok: true }));
app.get('/api/me', (req, res) => res.json({ role: getRole(req) }));

// ── Trip Groups ───────────────────────────────────────────────────────────────

app.get('/api/trip-groups', requireRole(), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tg.*,
        COALESCE(SUM(p.pax_count), 0)    AS total_pax,
        COALESCE(SUM(p.bags_count), 0)   AS total_bags,
        COUNT(DISTINCT cs.id)             AS car_slot_count,
        COALESCE(SUM(cs.total_seats), 0)  AS total_seats_available
      FROM trip_groups tg
      LEFT JOIN passengers p  ON p.trip_group_id = tg.id
      LEFT JOIN car_slots  cs ON cs.trip_group_id = tg.id
      GROUP BY tg.id
      ORDER BY tg.transit_date ASC, tg.transit_city ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trip groups' });
  }
});

app.post('/api/trip-groups', requireRole('ET'), async (req, res) => {
  const {
    transit_city, transit_date, direction, et_flight_number, destination,
    checkin_time, checkin_date,
    requested_pax, requester_pnr, requester_ticket,
    status, demand_note
  } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO trip_groups
       (transit_city, transit_date, direction, et_flight_number, destination,
        checkin_time, checkin_date,
        requested_pax, requester_pnr, requester_ticket, status, demand_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [transit_city, transit_date, direction,
       et_flight_number || null, destination || null,
       checkin_time || null, checkin_date || null,
       requested_pax || null, requester_pnr || null, requester_ticket || null,
       status || 'OPEN', demand_note || null]
    );
    broadcastUpdate('trip-groups-changed', { action: 'created', id: result.rows[0].id });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create trip group' });
  }
});

app.put('/api/trip-groups/:id', requireRole('ET'), async (req, res) => {
  const id = req.params.id;
  const {
    transit_city, transit_date, direction, et_flight_number, destination,
    checkin_time, checkin_date,
    requested_pax, requester_pnr, requester_ticket,
    status, demand_note
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE trip_groups SET
        transit_city=$1, transit_date=$2, direction=$3,
        et_flight_number=$4, destination=$5,
        checkin_time=$6, checkin_date=$7,
        requested_pax=$8, requester_pnr=$9, requester_ticket=$10,
        status=$11, demand_note=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [transit_city, transit_date, direction,
       et_flight_number || null, destination || null,
       checkin_time || null, checkin_date || null,
       requested_pax || null, requester_pnr || null, requester_ticket || null,
       status, demand_note || null, id]
    );
    broadcastUpdate('trip-groups-changed', { action: 'updated', id: Number(id) });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update trip group' });
  }
});

app.delete('/api/trip-groups/:id', requireRole('ET'), async (req, res) => {
  try {
    await pool.query('DELETE FROM trip_groups WHERE id=$1', [req.params.id]);
    broadcastUpdate('trip-groups-changed', { action: 'deleted', id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete trip group' });
  }
});

// ── Car Slots ─────────────────────────────────────────────────────────────────
// Alsawan can also create standalone car slots (not tied to a trip group) with their own date

app.get('/api/car-slots', requireRole(), async (req, res) => {
  // Return all car slots (optionally filtered by date)
  try {
    const result = await pool.query(`
      SELECT cs.*,
        tg.transit_city, tg.transit_date, tg.direction, tg.et_flight_number, tg.destination,
        tg.checkin_date, tg.checkin_time,
        COALESCE(SUM(p.pax_count), 0)  AS booked_pax,
        COALESCE(SUM(p.bags_count), 0) AS booked_bags,
        (cs.total_seats - COALESCE(SUM(p.pax_count), 0)) AS remaining_seats
      FROM car_slots cs
      LEFT JOIN trip_groups tg ON tg.id = cs.trip_group_id
      LEFT JOIN passengers p ON p.car_slot_id = cs.id
      GROUP BY cs.id, tg.id
      ORDER BY cs.service_date ASC, cs.created_at ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch car slots' });
  }
});

app.get('/api/trip-groups/:id/car-slots', requireRole(), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cs.*,
        COALESCE(SUM(p.pax_count), 0)  AS booked_pax,
        COALESCE(SUM(p.bags_count), 0) AS booked_bags,
        (cs.total_seats - COALESCE(SUM(p.pax_count), 0)) AS remaining_seats
      FROM car_slots cs
      LEFT JOIN passengers p ON p.car_slot_id = cs.id
      WHERE cs.trip_group_id = $1
      GROUP BY cs.id
      ORDER BY cs.created_at ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch car slots' });
  }
});

app.post('/api/trip-groups/:id/car-slots', requireRole('ALSAWAN'), async (req, res) => {
  const {
    vehicle_type, total_seats, bag_limit_per_pax, bag_limit_note,
    per_pax_cost_kwd, pickup_location_url, pickup_time, departure_time,
    service_date, alsawan_note
  } = req.body;
  try {
    // Use service_date if provided, otherwise inherit from trip group
    let date = service_date || null;
    if (!date) {
      const tg = await pool.query('SELECT transit_date FROM trip_groups WHERE id=$1', [req.params.id]);
      date = tg.rows[0]?.transit_date || null;
    }
    const result = await pool.query(
      `INSERT INTO car_slots
       (trip_group_id, vehicle_type, total_seats, bag_limit_per_pax, bag_limit_note,
        per_pax_cost_kwd, pickup_location_url, pickup_time, departure_time, service_date, alsawan_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.params.id, vehicle_type, total_seats,
       bag_limit_per_pax || null, bag_limit_note || null,
       per_pax_cost_kwd || null, pickup_location_url || null,
       pickup_time || null, departure_time || null,
       date, alsawan_note || null]
    );
    broadcastUpdate('car-slots-changed', { trip_group_id: Number(req.params.id), action: 'created' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create car slot' });
  }
});

// Alsawan creates a standalone car slot (not tied to a specific trip group)
app.post('/api/car-slots', requireRole('ALSAWAN'), async (req, res) => {
  const {
    trip_group_id, vehicle_type, total_seats, bag_limit_per_pax, bag_limit_note,
    per_pax_cost_kwd, pickup_location_url, pickup_time, departure_time,
    service_date, alsawan_note
  } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO car_slots
       (trip_group_id, vehicle_type, total_seats, bag_limit_per_pax, bag_limit_note,
        per_pax_cost_kwd, pickup_location_url, pickup_time, departure_time, service_date, alsawan_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [trip_group_id || null, vehicle_type, total_seats,
       bag_limit_per_pax || null, bag_limit_note || null,
       per_pax_cost_kwd || null, pickup_location_url || null,
       pickup_time || null, departure_time || null,
       service_date || null, alsawan_note || null]
    );
    broadcastUpdate('car-slots-changed', { trip_group_id: trip_group_id || null, action: 'created' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create car slot' });
  }
});

app.put('/api/car-slots/:id', requireRole('ALSAWAN'), async (req, res) => {
  const id = req.params.id;
  const {
    vehicle_type, total_seats, bag_limit_per_pax, bag_limit_note,
    per_pax_cost_kwd, pickup_location_url, pickup_time, departure_time,
    service_date, status, alsawan_note
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE car_slots SET
        vehicle_type=$1, total_seats=$2, bag_limit_per_pax=$3, bag_limit_note=$4,
        per_pax_cost_kwd=$5, pickup_location_url=$6, pickup_time=$7, departure_time=$8,
        service_date=$9, status=$10, alsawan_note=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [vehicle_type, total_seats,
       bag_limit_per_pax || null, bag_limit_note || null,
       per_pax_cost_kwd || null, pickup_location_url || null,
       pickup_time || null, departure_time || null,
       service_date || null, status || 'OPEN', alsawan_note || null, id]
    );
    const slotRow = result.rows[0];
    broadcastUpdate('car-slots-changed', { trip_group_id: slotRow.trip_group_id, action: 'updated', id: Number(id) });
    res.json(slotRow);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update car slot' });
  }
});

app.delete('/api/car-slots/:id', requireRole('ALSAWAN'), async (req, res) => {
  try {
    const row = await pool.query('SELECT trip_group_id FROM car_slots WHERE id=$1', [req.params.id]);
    await pool.query('DELETE FROM car_slots WHERE id=$1', [req.params.id]);
    if (row.rows[0]) broadcastUpdate('car-slots-changed', { trip_group_id: row.rows[0].trip_group_id, action: 'deleted' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete car slot' });
  }
});

// ── Passengers ────────────────────────────────────────────────────────────────

app.get('/api/trip-groups/:id/passengers', requireRole(), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, cs.vehicle_type AS car_vehicle_type
       FROM passengers p
       LEFT JOIN car_slots cs ON cs.id = p.car_slot_id
       WHERE p.trip_group_id=$1
       ORDER BY p.id ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch passengers' });
  }
});

app.post('/api/trip-groups/:id/passengers', requireRole('ET'), async (req, res) => {
  const { name, pnr, ticket_number, pax_count, bags_count, visa_status, car_slot_id } = req.body;
  const tripGroupId = req.params.id;
  try {
    if (car_slot_id) {
      const capacityCheck = await pool.query(`
        SELECT cs.total_seats, cs.bag_limit_per_pax, cs.status,
          COALESCE(SUM(p.pax_count), 0) AS booked_pax,
          COALESCE(SUM(p.bags_count), 0) AS booked_bags
        FROM car_slots cs
        LEFT JOIN passengers p ON p.car_slot_id = cs.id
        WHERE cs.id = $1
        GROUP BY cs.id
      `, [car_slot_id]);

      const slot = capacityCheck.rows[0];
      if (!slot) return res.status(404).json({ error: 'Car slot not found' });
      if (slot.status === 'FULL' || slot.status === 'CANCELLED') {
        return res.status(400).json({ error: `This vehicle is ${slot.status}. Please choose another or request a new one from Alsawan.` });
      }
      const newPax = Number(slot.booked_pax) + Number(pax_count || 1);
      if (newPax > slot.total_seats) {
        return res.status(400).json({
          error: `Not enough seats. This vehicle has ${slot.total_seats - slot.booked_pax} seat(s) remaining.`
        });
      }
      // Check bag limit
      if (slot.bag_limit_per_pax && bags_count) {
        const maxBags = slot.bag_limit_per_pax * Number(pax_count || 1);
        if (Number(bags_count) > maxBags) {
          return res.status(400).json({
            error: `Bag limit exceeded. This vehicle allows ${slot.bag_limit_per_pax} bag(s) per passenger (max ${maxBags} bags for ${pax_count} pax).`
          });
        }
      }
      if (newPax === slot.total_seats) {
        await pool.query(`UPDATE car_slots SET status='FULL', updated_at=NOW() WHERE id=$1`, [car_slot_id]);
        broadcastUpdate('car-slots-changed', { trip_group_id: Number(tripGroupId), action: 'full', slot_id: Number(car_slot_id) });
      }
    }

    const result = await pool.query(
      `INSERT INTO passengers (trip_group_id, car_slot_id, name, pnr, ticket_number, pax_count, bags_count, visa_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tripGroupId, car_slot_id || null, name || null, pnr || null,
       ticket_number || null, pax_count || 1, bags_count || null, visa_status || 'NOT_APPLIED']
    );
    broadcastUpdate('passengers-changed', { trip_group_id: Number(tripGroupId), action: 'created' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to add passenger' });
  }
});

app.put('/api/passengers/:id', requireRole('ET'), async (req, res) => {
  const { name, pnr, ticket_number, pax_count, bags_count, visa_status, car_slot_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE passengers SET name=$1, pnr=$2, ticket_number=$3, pax_count=$4,
       bags_count=$5, visa_status=$6, car_slot_id=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name || null, pnr || null, ticket_number || null, pax_count || 1,
       bags_count || null, visa_status || 'NOT_APPLIED', car_slot_id || null, req.params.id]
    );
    const p = result.rows[0];
    broadcastUpdate('passengers-changed', { trip_group_id: p.trip_group_id, action: 'updated' });
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update passenger' });
  }
});

app.delete('/api/passengers/:id', requireRole('ET'), async (req, res) => {
  try {
    const row = await pool.query('SELECT trip_group_id, car_slot_id, pax_count FROM passengers WHERE id=$1', [req.params.id]);
    await pool.query('DELETE FROM passengers WHERE id=$1', [req.params.id]);
    const p = row.rows[0];
    if (p) {
      if (p.car_slot_id) {
        await pool.query(`UPDATE car_slots SET status='OPEN', updated_at=NOW() WHERE id=$1 AND status='FULL'`, [p.car_slot_id]);
      }
      broadcastUpdate('passengers-changed', { trip_group_id: p.trip_group_id, action: 'deleted' });
      broadcastUpdate('car-slots-changed', { trip_group_id: p.trip_group_id, action: 'updated' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete passenger' });
  }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Serve frontend ────────────────────────────────────────────────────────────
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
