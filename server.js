import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(cors({ origin: true, credentials: true }));
app.set('trust proxy', 1);

const ET_PASSWORD = process.env.ET_PASSWORD;
const ALSAWAN_PASSWORD = process.env.ALSAWAN_PASSWORD;

// ── SSE: connected clients ────────────────────────────────────────────────────
// Each entry: { res, id }
const sseClients = new Set();

function broadcastUpdate(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// SSE endpoint — no auth required so both roles can subscribe
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering on Render
  res.flushHeaders();

  // Send a heartbeat every 25 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 25000);

  sseClients.add(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ── Auth helpers ──────────────────────────────────────────────────────────────

function requireRole(role) {
  return (req, res, next) => {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token || token !== role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
}

function getRole(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token === 'ET' || token === 'ALSAWAN') return token;
  return null;
}

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  let role = null;
  if (ET_PASSWORD && password === ET_PASSWORD) role = 'ET';
  if (ALSAWAN_PASSWORD && password === ALSAWAN_PASSWORD) role = 'ALSAWAN';

  if (!role) return res.status(401).json({ error: 'Invalid password' });

  return res.json({ role, token: role });
});

app.post('/api/logout', (req, res) => res.json({ ok: true }));

app.get('/api/me', (req, res) => res.json({ role: getRole(req) }));

// ── Trip groups ───────────────────────────────────────────────────────────────

app.get('/api/trip-groups', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tg.*,
        COALESCE(SUM(p.pax_count), 0) AS total_pax,
        ti.transport_status,
        ti.per_pax_cost_kwd
      FROM trip_groups tg
      LEFT JOIN passengers p ON p.trip_group_id = tg.id
      LEFT JOIN transport_info ti ON ti.trip_group_id = tg.id
      GROUP BY tg.id, ti.transport_status, ti.per_pax_cost_kwd
      ORDER BY tg.transit_date ASC, tg.transit_city ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trip groups' });
  }
});

app.post('/api/trip-groups', requireRole('ET'), async (req, res) => {
  const { transit_city, transit_date, direction, et_flight_number, destination,
          requested_pax, requester_pnr, requester_ticket, status, demand_note } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO trip_groups
       (transit_city, transit_date, direction, et_flight_number, destination,
        requested_pax, requester_pnr, requester_ticket, status, demand_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [transit_city, transit_date, direction,
       et_flight_number || null, destination || null,
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
  const { transit_city, transit_date, direction, et_flight_number, destination,
          requested_pax, requester_pnr, requester_ticket, status, demand_note } = req.body;
  try {
    const result = await pool.query(
      `UPDATE trip_groups SET transit_city=$1, transit_date=$2, direction=$3, et_flight_number=$4,
       destination=$5, requested_pax=$6, requester_pnr=$7, requester_ticket=$8,
       status=$9, demand_note=$10, updated_at=NOW() WHERE id=$11 RETURNING *`,
      [transit_city, transit_date, direction,
       et_flight_number || null, destination || null,
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

// ── Passengers ────────────────────────────────────────────────────────────────

app.get('/api/trip-groups/:id/passengers', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM passengers WHERE trip_group_id=$1 ORDER BY id ASC`, [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch passengers' });
  }
});

app.post('/api/trip-groups/:id/passengers', requireRole('ET'), async (req, res) => {
  const { name, pnr, ticket_number, pax_count, bags_count, visa_status } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO passengers (trip_group_id, name, pnr, ticket_number, pax_count, bags_count, visa_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, name || null, pnr || null, ticket_number || null, pax_count || 1, bags_count || null, visa_status || 'NOT_APPLIED']
    );
    broadcastUpdate('passengers-changed', { trip_group_id: Number(req.params.id), action: 'created' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add passenger' });
  }
});

app.put('/api/passengers/:id', requireRole('ET'), async (req, res) => {
  const { name, pnr, ticket_number, pax_count, bags_count, visa_status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE passengers SET name=$1, pnr=$2, ticket_number=$3, pax_count=$4, bags_count=$5,
       visa_status=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name || null, pnr || null, ticket_number || null, pax_count || 1, bags_count || null, visa_status || 'NOT_APPLIED', req.params.id]
    );
    broadcastUpdate('passengers-changed', { trip_group_id: result.rows[0].trip_group_id, action: 'updated' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update passenger' });
  }
});

app.delete('/api/passengers/:id', requireRole('ET'), async (req, res) => {
  try {
    const existing = await pool.query(`SELECT trip_group_id FROM passengers WHERE id=$1`, [req.params.id]);
    await pool.query(`DELETE FROM passengers WHERE id=$1`, [req.params.id]);
    const tgId = existing.rows[0]?.trip_group_id;
    broadcastUpdate('passengers-changed', { trip_group_id: tgId, action: 'deleted' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete passenger' });
  }
});

// ── Transport info ────────────────────────────────────────────────────────────

app.get('/api/trip-groups/:id/transport', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM transport_info WHERE trip_group_id=$1`, [req.params.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transport info' });
  }
});

app.post('/api/trip-groups/:id/transport', requireRole('ALSAWAN'), async (req, res) => {
  const trip_group_id = req.params.id;
  const { vehicle_type, per_pax_cost_kwd, bag_limit_text, transport_status, alsawan_note } = req.body;
  try {
    const existing = await pool.query(`SELECT id FROM transport_info WHERE trip_group_id=$1`, [trip_group_id]);
    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE transport_info SET vehicle_type=$1, per_pax_cost_kwd=$2, bag_limit_text=$3,
         transport_status=$4, alsawan_note=$5, updated_at=NOW() WHERE trip_group_id=$6 RETURNING *`,
        [vehicle_type || null, per_pax_cost_kwd || null, bag_limit_text || null, transport_status || 'COLLECTING', alsawan_note || null, trip_group_id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO transport_info (trip_group_id, vehicle_type, per_pax_cost_kwd, bag_limit_text, transport_status, alsawan_note)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [trip_group_id, vehicle_type || null, per_pax_cost_kwd || null, bag_limit_text || null, transport_status || 'COLLECTING', alsawan_note || null]
      );
    }
    broadcastUpdate('transport-changed', { trip_group_id: Number(trip_group_id), action: 'saved' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save transport info' });
  }
});

// ── Serve frontend ────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [production=${IS_PRODUCTION}]`);
});
