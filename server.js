import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

const ET_PASSWORD = process.env.ET_PASSWORD;
const ALSAWAN_PASSWORD = process.env.ALSAWAN_PASSWORD;

// Simple auth middleware
function requireRole(role) {
  return (req, res, next) => {
    const userRole = req.cookies.role;
    if (!userRole || userRole !== role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
}

// Login: password only, decides role
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  let role = null;
  if (password === ET_PASSWORD) role = 'ET';
  if (password === ALSAWAN_PASSWORD) role = 'ALSAWAN';

  if (!role) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  res.cookie('role', role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  return res.json({ role });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('role');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const role = req.cookies.role || null;
  res.json({ role });
});

// Trip groups (shared, but ET creates/edits, Alsawan reads)
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
  const {
    transit_city,
    transit_date,
    direction,
    et_flight_number,
    destination,
    status,
    demand_note
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO trip_groups
      (transit_city, transit_date, direction, et_flight_number, destination, status, demand_note)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        transit_city,
        transit_date,
        direction,
        et_flight_number || null,
        destination || null,
        status || 'OPEN',
        demand_note || null
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create trip group' });
  }
});

app.put('/api/trip-groups/:id', requireRole('ET'), async (req, res) => {
  const id = req.params.id;
  const {
    transit_city,
    transit_date,
    direction,
    et_flight_number,
    destination,
    status,
    demand_note
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE trip_groups
       SET transit_city=$1,
           transit_date=$2,
           direction=$3,
           et_flight_number=$4,
           destination=$5,
           status=$6,
           demand_note=$7,
           updated_at=NOW()
       WHERE id=$8
       RETURNING *`,
      [
        transit_city,
        transit_date,
        direction,
        et_flight_number || null,
        destination || null,
        status,
        demand_note || null,
        id
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update trip group' });
  }
});

// Passengers (ET only)
app.get('/api/trip-groups/:id/passengers', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query(
      `SELECT * FROM passengers WHERE trip_group_id=$1 ORDER BY id ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch passengers' });
  }
});

app.post('/api/trip-groups/:id/passengers', requireRole('ET'), async (req, res) => {
  const trip_group_id = req.params.id;
  const {
    name,
    pnr,
    ticket_number,
    pax_count,
    bags_count,
    visa_status
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO passengers
      (trip_group_id, name, pnr, ticket_number, pax_count, bags_count, visa_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        trip_group_id,
        name || null,
        pnr || null,
        ticket_number || null,
        pax_count || 1,
        bags_count || null,
        visa_status || 'NOT_APPLIED'
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add passenger' });
  }
});

app.put('/api/passengers/:id', requireRole('ET'), async (req, res) => {
  const id = req.params.id;
  const {
    name,
    pnr,
    ticket_number,
    pax_count,
    bags_count,
    visa_status
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE passengers
       SET name=$1,
           pnr=$2,
           ticket_number=$3,
           pax_count=$4,
           bags_count=$5,
           visa_status=$6,
           updated_at=NOW()
       WHERE id=$7
       RETURNING *`,
      [
        name || null,
        pnr || null,
        ticket_number || null,
        pax_count || 1,
        bags_count || null,
        visa_status || 'NOT_APPLIED',
        id
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update passenger' });
  }
});

app.delete('/api/passengers/:id', requireRole('ET'), async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query(`DELETE FROM passengers WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete passenger' });
  }
});

// Transport info (Alsawan only)
app.get('/api/trip-groups/:id/transport', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query(
      `SELECT * FROM transport_info WHERE trip_group_id=$1`,
      [id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transport info' });
  }
});

app.post('/api/trip-groups/:id/transport', requireRole('ALSAWAN'), async (req, res) => {
  const trip_group_id = req.params.id;
  const {
    vehicle_type,
    per_pax_cost_kwd,
    bag_limit_text,
    transport_status,
    alsawan_note
  } = req.body;

  try {
    const existing = await pool.query(
      `SELECT id FROM transport_info WHERE trip_group_id=$1`,
      [trip_group_id]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE transport_info
         SET vehicle_type=$1,
             per_pax_cost_kwd=$2,
             bag_limit_text=$3,
             transport_status=$4,
             alsawan_note=$5,
             updated_at=NOW()
         WHERE trip_group_id=$6
         RETURNING *`,
        [
          vehicle_type || null,
          per_pax_cost_kwd || null,
          bag_limit_text || null,
          transport_status || 'COLLECTING',
          alsawan_note || null,
          trip_group_id
        ]
      );
    } else {
      result = await pool.query(
        `INSERT INTO transport_info
        (trip_group_id, vehicle_type, per_pax_cost_kwd, bag_limit_text, transport_status, alsawan_note)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *`,
        [
          trip_group_id,
          vehicle_type || null,
          per_pax_cost_kwd || null,
          bag_limit_text || null,
          transport_status || 'COLLECTING',
          alsawan_note || null
        ]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save transport info' });
  }
});

// Serve frontend
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
