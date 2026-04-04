-- Run this once on your PostgreSQL database.
-- If you already ran the previous schema, run only the ALTER TABLE statements at the bottom.

CREATE TABLE IF NOT EXISTS trip_groups (
  id SERIAL PRIMARY KEY,
  transit_city VARCHAR(10) NOT NULL,
  transit_date DATE NOT NULL,
  direction VARCHAR(10) NOT NULL,         -- INBOUND / OUTBOUND
  et_flight_number VARCHAR(20),
  destination VARCHAR(100),
  requested_pax INTEGER,                  -- Number of passengers requested by ET
  requester_pnr VARCHAR(20),              -- PNR of the requester
  requester_ticket VARCHAR(30),           -- Ticket number of the requester
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  demand_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS passengers (
  id SERIAL PRIMARY KEY,
  trip_group_id INTEGER NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  name VARCHAR(100),
  pnr VARCHAR(20),
  ticket_number VARCHAR(30),
  pax_count INTEGER NOT NULL DEFAULT 1,
  bags_count INTEGER,
  visa_status VARCHAR(20) DEFAULT 'NOT_APPLIED',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transport_info (
  id SERIAL PRIMARY KEY,
  trip_group_id INTEGER NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  vehicle_type VARCHAR(20),
  per_pax_cost_kwd NUMERIC(10,2),
  bag_limit_text VARCHAR(200),
  transport_status VARCHAR(20) DEFAULT 'COLLECTING',
  alsawan_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ── If you already ran the old schema, run these ALTER statements to add the new columns:
-- ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS requested_pax INTEGER;
-- ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS requester_pnr VARCHAR(20);
-- ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS requester_ticket VARCHAR(30);
