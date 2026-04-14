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

// ── Auto-migration ────────────────────────────────────────────────────────────
async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Trip groups
      CREATE TABLE IF NOT EXISTS trip_groups (
        id               SERIAL PRIMARY KEY,
        transit_city     VARCHAR(20)  NOT NULL,
        transit_date     DATE         NOT NULL,
        direction        VARCHAR(10)  NOT NULL,
        et_flight_number VARCHAR(20),
        destination      VARCHAR(100),
        checkin_date     DATE,
        checkin_time     TIME,
        requested_pax    INTEGER,
        requester_pnr    VARCHAR(20),
        requester_ticket VARCHAR(30),
        status           VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
        demand_note      TEXT,
        created_at       TIMESTAMP DEFAULT NOW(),
        updated_at       TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS checkin_date     DATE;
      ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS checkin_time     TIME;
      ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS requested_pax    INTEGER;
      ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS requester_pnr    VARCHAR(20);
      ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS requester_ticket VARCHAR(30);

      -- Car slots (standalone or linked to trip group)
      CREATE TABLE IF NOT EXISTS car_slots (
        id                  SERIAL PRIMARY KEY,
        trip_group_id       INTEGER      REFERENCES trip_groups(id) ON DELETE CASCADE,
        transit_city        VARCHAR(20),
        vehicle_type        VARCHAR(30)  NOT NULL,
        total_seats         INTEGER      NOT NULL,
        bag_limit_per_pax   INTEGER,
        bag_limit_note      TEXT,
        per_pax_cost_kwd    NUMERIC(10,2),
        pickup_location_url TEXT,
        pickup_time         TIME,
        departure_time      TIME,
        service_date        DATE,
        status              VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
        alsawan_note        TEXT,
        created_at          TIMESTAMP DEFAULT NOW(),
        updated_at          TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE car_slots ADD COLUMN IF NOT EXISTS service_date           DATE;
      ALTER TABLE car_slots ADD COLUMN IF NOT EXISTS transit_city           VARCHAR(20);
      ALTER TABLE car_slots ADD COLUMN IF NOT EXISTS total_vehicle_price_kwd NUMERIC(10,3);
      ALTER TABLE car_slots ALTER COLUMN trip_group_id DROP NOT NULL;

      -- Passengers — both trip-group passengers AND standalone vehicle passengers
      -- trip_group_id is NULLABLE so standalone vehicle passengers can be stored
      CREATE TABLE IF NOT EXISTS passengers (
        id             SERIAL PRIMARY KEY,
        trip_group_id  INTEGER REFERENCES trip_groups(id) ON DELETE CASCADE,
        car_slot_id    INTEGER REFERENCES car_slots(id)   ON DELETE SET NULL,
        name           VARCHAR(100),
        pnr            VARCHAR(20),
        ticket_number  VARCHAR(30),
        pax_count      INTEGER NOT NULL DEFAULT 1,
        bags_count     INTEGER,
        visa_status    VARCHAR(20) DEFAULT 'NOT_APPLIED',
        payment_status VARCHAR(30) DEFAULT 'AWAITING_FINAL_COST',
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE passengers ADD COLUMN IF NOT EXISTS car_slot_id INTEGER REFERENCES car_slots(id) ON DELETE SET NULL;
      ALTER TABLE passengers ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'AWAITING_FINAL_COST';
      -- Make trip_group_id nullable for standalone passengers
      ALTER TABLE passengers ALTER COLUMN trip_group_id DROP NOT NULL;

      -- Legacy transport_info table
      CREATE TABLE IF NOT EXISTS transport_info (
        id               SERIAL PRIMARY KEY,
        trip_group_id    INTEGER NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
        vehicle_type     VARCHAR(20),
        per_pax_cost_kwd NUMERIC(10,2),
        bag_limit_text   VARCHAR(200),
        transport_status VARCHAR(20) DEFAULT 'COLLECTING',
        alsawan_note     TEXT,
        created_at       TIMESTAMP DEFAULT NOW(),
        updated_at       TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Database migrations applied successfully');
  } catch (err) {
    console.error('✗ Migration error:', err.message);
  } finally {
    client.release();
  }
}

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
    res.status(500).json({ error: 'Failed to create trip group: ' + err.message });
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
    res.status(500).json({ error: 'Failed to update trip group: ' + err.message });
  }
});

app.delete('/api/trip-groups/:id', requireRole('ET'), async (req, res) => {
  try {
    await pool.query('DELETE FROM trip_groups WHERE id=$1', [req.params.id]);
    broadcastUpdate('trip-groups-changed', { action: 'deleted', id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete trip group: ' + err.message });
  }
});

// ── Car Slots ─────────────────────────────────────────────────────────────────

// GET all car slots (with passenger counts) — used by both dashboards
app.get('/api/car-slots', requireRole(), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cs.*,
        tg.transit_city   AS tg_transit_city,
        tg.transit_date   AS tg_transit_date,
        tg.direction      AS tg_direction,
        tg.et_flight_number,
        tg.destination,
        tg.checkin_date,
        tg.checkin_time,
        COALESCE(SUM(p.pax_count), 0)  AS booked_pax,
        COALESCE(SUM(p.bags_count), 0) AS booked_bags,
        (cs.total_seats - COALESCE(SUM(p.pax_count), 0)) AS remaining_seats
      FROM car_slots cs
      LEFT JOIN trip_groups tg ON tg.id = cs.trip_group_id
      LEFT JOIN passengers  p  ON p.car_slot_id = cs.id
      GROUP BY cs.id, tg.id
      ORDER BY cs.service_date ASC NULLS LAST, cs.created_at ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch car slots: ' + err.message });
  }
});

// GET car slots for a specific trip group
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
    res.status(500).json({ error: 'Failed to fetch car slots: ' + err.message });
  }
});

// POST car slot linked to a trip group
app.post('/api/trip-groups/:id/car-slots', requireRole('ALSAWAN'), async (req, res) => {
  const {
    vehicle_type, total_seats, bag_limit_per_pax, bag_limit_note,
    per_pax_cost_kwd, total_vehicle_price_kwd,
    pickup_location_url, pickup_time, departure_time,
    service_date, transit_city, alsawan_note
  } = req.body;
  try {
    let date = service_date || null;
    if (!date) {
      const tg = await pool.query('SELECT transit_date FROM trip_groups WHERE id=$1', [req.params.id]);
      date = tg.rows[0]?.transit_date || null;
    }
    const result = await pool.query(
      `INSERT INTO car_slots
       (trip_group_id, transit_city, vehicle_type, total_seats, bag_limit_per_pax, bag_limit_note,
        per_pax_cost_kwd, total_vehicle_price_kwd, pickup_location_url, pickup_time, departure_time, service_date, alsawan_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.params.id, transit_city || null, vehicle_type, total_seats,
       bag_limit_per_pax || null, bag_limit_note || null,
       per_pax_cost_kwd || null, total_vehicle_price_kwd || null,
       pickup_location_url || null,
       pickup_time || null, departure_time || null,
       date, alsawan_note || null]
    );
    broadcastUpdate('car-slots-changed', { trip_group_id: Number(req.params.id), action: 'created' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create car slot: ' + err.message });
  }
});

// POST standalone car slot (no trip group)
app.post('/api/car-slots', requireRole('ALSAWAN'), async (req, res) => {
  const {
    trip_group_id, transit_city, vehicle_type, total_seats, bag_limit_per_pax, bag_limit_note,
    per_pax_cost_kwd, total_vehicle_price_kwd,
    pickup_location_url, pickup_time, departure_time,
    service_date, alsawan_note
  } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO car_slots
       (trip_group_id, transit_city, vehicle_type, total_seats, bag_limit_per_pax, bag_limit_note,
        per_pax_cost_kwd, total_vehicle_price_kwd, pickup_location_url, pickup_time, departure_time, service_date, alsawan_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [trip_group_id || null, transit_city || null, vehicle_type, total_seats,
       bag_limit_per_pax || null, bag_limit_note || null,
       per_pax_cost_kwd || null, total_vehicle_price_kwd || null,
       pickup_location_url || null,
       pickup_time || null, departure_time || null,
       service_date || null, alsawan_note || null]
    );
    broadcastUpdate('car-slots-changed', { trip_group_id: trip_group_id || null, action: 'created' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/car-slots error:', err.message, err.detail || '');
    res.status(500).json({ error: 'Failed to create car slot: ' + err.message });
  }
});

app.put('/api/car-slots/:id', requireRole('ALSAWAN'), async (req, res) => {
  const id = req.params.id;
  const {
    vehicle_type, total_seats, bag_limit_per_pax, bag_limit_note,
    per_pax_cost_kwd, total_vehicle_price_kwd,
    pickup_location_url, pickup_time, departure_time,
    service_date, transit_city, status, alsawan_note
  } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current booked pax count so we can auto-compute the correct status
    const bookedRes = await client.query(
      `SELECT COALESCE(SUM(p.pax_count), 0) AS booked_pax,
              cs.status AS current_status
       FROM car_slots cs
       LEFT JOIN passengers p ON p.car_slot_id = cs.id
       WHERE cs.id = $1
       GROUP BY cs.id`,
      [id]
    );
    const bookedPax   = Number(bookedRes.rows[0]?.booked_pax  || 0);
    const currentStatus = bookedRes.rows[0]?.current_status || 'OPEN';
    const newSeats    = Number(total_seats);

    // Auto-compute status:
    //  - If COMPLETED or CANCELLED, keep it (only explicit toggle can change those)
    //  - If new seats > booked pax  → OPEN  (capacity was expanded, re-open)
    //  - If new seats <= booked pax → FULL  (still at or over capacity)
    //  - Otherwise respect the client-sent status (e.g. manual Mark Full)
    let resolvedStatus;
    if (currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') {
      resolvedStatus = currentStatus;
    } else if (newSeats > bookedPax) {
      resolvedStatus = 'OPEN';
    } else if (newSeats <= bookedPax) {
      resolvedStatus = 'FULL';
    } else {
      resolvedStatus = status || 'OPEN';
    }

    const result = await client.query(
      `UPDATE car_slots SET
        vehicle_type=$1, total_seats=$2, bag_limit_per_pax=$3, bag_limit_note=$4,
        per_pax_cost_kwd=$5, total_vehicle_price_kwd=$6,
        pickup_location_url=$7, pickup_time=$8, departure_time=$9,
        service_date=$10, transit_city=$11, status=$12, alsawan_note=$13, updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [vehicle_type, newSeats,
       bag_limit_per_pax || null, bag_limit_note || null,
       per_pax_cost_kwd || null, total_vehicle_price_kwd || null,
       pickup_location_url || null,
       pickup_time || null, departure_time || null,
       service_date || null, transit_city || null,
       resolvedStatus, alsawan_note || null, id]
    );
    await client.query('COMMIT');
    const slotRow = result.rows[0];
    broadcastUpdate('car-slots-changed', { trip_group_id: slotRow.trip_group_id, slot_id: Number(id), action: 'updated' });
    res.json(slotRow);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Failed to update car slot: ' + err.message });
  } finally {
    client.release();
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
    res.status(500).json({ error: 'Failed to delete car slot: ' + err.message });
  }
});

// ── Passengers ────────────────────────────────────────────────────────────────
// UNIFIED: all passengers stored in one table, retrievable by trip_group_id OR car_slot_id

// GET passengers for a trip group
app.get('/api/trip-groups/:id/passengers', requireRole(), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, cs.vehicle_type AS car_vehicle_type
       FROM passengers p
       LEFT JOIN car_slots cs ON cs.id = p.car_slot_id
       WHERE p.trip_group_id = $1
       ORDER BY p.id ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch passengers: ' + err.message });
  }
});

// GET passengers for a specific car slot (works for both standalone and trip-group slots)
app.get('/api/car-slots/:id/passengers', requireRole(), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, cs.vehicle_type AS car_vehicle_type
       FROM passengers p
       LEFT JOIN car_slots cs ON cs.id = p.car_slot_id
       WHERE p.car_slot_id = $1
       ORDER BY p.id ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch passengers: ' + err.message });
  }
});

// Helper: check capacity and auto-mark full
async function checkAndInsertPassenger(client, { trip_group_id, car_slot_id, name, pnr, ticket_number, pax_count, bags_count, visa_status, payment_status }) {
  if (car_slot_id) {
    const capacityCheck = await client.query(`
      SELECT cs.total_seats, cs.bag_limit_per_pax, cs.status,
        COALESCE(SUM(p.pax_count), 0) AS booked_pax
      FROM car_slots cs
      LEFT JOIN passengers p ON p.car_slot_id = cs.id
      WHERE cs.id = $1
      GROUP BY cs.id
    `, [car_slot_id]);

    const slot = capacityCheck.rows[0];
    if (!slot) throw Object.assign(new Error('Vehicle not found'), { status: 404 });
    if (slot.status === 'FULL' || slot.status === 'COMPLETED' || slot.status === 'CANCELLED') {
      throw Object.assign(new Error(`This vehicle is ${slot.status}. Please choose another or request a new one from Alsawan.`), { status: 400 });
    }
    const newPax = Number(slot.booked_pax) + Number(pax_count || 1);
    if (newPax > slot.total_seats) {
      throw Object.assign(new Error(`Not enough seats. Only ${slot.total_seats - Number(slot.booked_pax)} seat(s) remaining.`), { status: 400 });
    }
    if (slot.bag_limit_per_pax && bags_count) {
      const maxBags = slot.bag_limit_per_pax * Number(pax_count || 1);
      if (Number(bags_count) > maxBags) {
        throw Object.assign(new Error(`Bag limit exceeded. Max ${slot.bag_limit_per_pax} bag(s)/pax (${maxBags} total for ${pax_count} pax).`), { status: 400 });
      }
    }
    if (newPax >= slot.total_seats) {
      await client.query(`UPDATE car_slots SET status='FULL', updated_at=NOW() WHERE id=$1`, [car_slot_id]);
    }
  }

  const result = await client.query(
    `INSERT INTO passengers (trip_group_id, car_slot_id, name, pnr, ticket_number, pax_count, bags_count, visa_status, payment_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [trip_group_id || null, car_slot_id || null,
     name || null, pnr || null, ticket_number || null,
     pax_count || 1, bags_count || null, visa_status || 'NOT_APPLIED',
     payment_status || 'AWAITING_FINAL_COST']
  );
  return result.rows[0];
}

// POST passenger to a trip group (ET adds pax to a trip-group, optionally assigned to a car slot)
app.post('/api/trip-groups/:id/passengers', requireRole('ET'), async (req, res) => {
  const { name, pnr, ticket_number, pax_count, bags_count, visa_status, payment_status, car_slot_id } = req.body;
  const tripGroupId = Number(req.params.id);
  const client = await pool.connect();
  try {
    const pax = await checkAndInsertPassenger(client, {
      trip_group_id: tripGroupId,
      car_slot_id: car_slot_id || null,
      name, pnr, ticket_number, pax_count, bags_count, visa_status, payment_status
    });
    broadcastUpdate('passengers-changed', { trip_group_id: tripGroupId, car_slot_id: car_slot_id || null, action: 'created' });
    if (car_slot_id) broadcastUpdate('car-slots-changed', { trip_group_id: tripGroupId, slot_id: Number(car_slot_id), action: 'passenger-added' });
    res.json(pax);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to add passenger' });
  } finally {
    client.release();
  }
});

// POST passenger to a standalone car slot (ET adds pax directly to Alsawan's standalone vehicle)
app.post('/api/car-slots/:id/passengers', requireRole('ET'), async (req, res) => {
  const slotId = Number(req.params.id);
  const { name, pnr, ticket_number, pax_count, bags_count, visa_status, payment_status } = req.body;
  const client = await pool.connect();
  try {
    const pax = await checkAndInsertPassenger(client, {
      trip_group_id: null,  // standalone — no trip group
      car_slot_id: slotId,
      name, pnr, ticket_number, pax_count, bags_count, visa_status, payment_status
    });
    broadcastUpdate('passengers-changed', { car_slot_id: slotId, action: 'created' });
    broadcastUpdate('car-slots-changed', { slot_id: slotId, action: 'passenger-added' });
    res.json(pax);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to add passenger' });
  } finally {
    client.release();
  }
});

app.put('/api/passengers/:id', requireRole('ET'), async (req, res) => {
  const { name, pnr, ticket_number, pax_count, bags_count, visa_status, payment_status, car_slot_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE passengers SET name=$1, pnr=$2, ticket_number=$3, pax_count=$4,
       bags_count=$5, visa_status=$6, payment_status=$7, car_slot_id=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name || null, pnr || null, ticket_number || null, pax_count || 1,
       bags_count || null, visa_status || 'NOT_APPLIED',
       payment_status || 'AWAITING_FINAL_COST', car_slot_id || null, req.params.id]
    );
    const p = result.rows[0];
    broadcastUpdate('passengers-changed', { trip_group_id: p.trip_group_id, car_slot_id: p.car_slot_id, action: 'updated' });
    broadcastUpdate('car-slots-changed', { slot_id: p.car_slot_id, action: 'updated' });
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update passenger: ' + err.message });
  }
});

app.delete('/api/passengers/:id', requireRole('ET'), async (req, res) => {
  try {
    const row = await pool.query('SELECT trip_group_id, car_slot_id, pax_count FROM passengers WHERE id=$1', [req.params.id]);
    await pool.query('DELETE FROM passengers WHERE id=$1', [req.params.id]);
    const p = row.rows[0];
    if (p) {
      if (p.car_slot_id) {
        // Re-open vehicle if it was marked full
        await pool.query(`UPDATE car_slots SET status='OPEN', updated_at=NOW() WHERE id=$1 AND status='FULL'`, [p.car_slot_id]);
        broadcastUpdate('car-slots-changed', { slot_id: p.car_slot_id, action: 'passenger-removed' });
      }
      broadcastUpdate('passengers-changed', { trip_group_id: p.trip_group_id, car_slot_id: p.car_slot_id, action: 'deleted' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete passenger: ' + err.message });
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

runMigrations().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to run migrations, starting anyway:', err.message);
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
