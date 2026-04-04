-- ════════════════════════════════════════════════════════════════════════════
-- ET–Alsawan Coordination Platform — Full Schema
-- Run this once on a fresh database.
-- For existing databases, see the ALTER TABLE migration section at the bottom.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Trip Groups ──────────────────────────────────────────────────────────────
-- Created by ET. Represents one transit event (date + city + direction).
CREATE TABLE IF NOT EXISTS trip_groups (
  id                SERIAL PRIMARY KEY,
  transit_city      VARCHAR(10)  NOT NULL,
  transit_date      DATE         NOT NULL,
  direction         VARCHAR(10)  NOT NULL,           -- INBOUND / OUTBOUND
  et_flight_number  VARCHAR(20),
  destination       VARCHAR(100),
  checkin_time      TIME,                            -- ET sets flight check-in time
  checkin_date      DATE,                            -- ET sets flight check-in date (may differ from transit_date)
  requested_pax     INTEGER,
  requester_pnr     VARCHAR(20),
  requester_ticket  VARCHAR(30),
  status            VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
  demand_note       TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- ── Car Slots ────────────────────────────────────────────────────────────────
-- Created by Alsawan. Each row = one available vehicle for a trip group.
CREATE TABLE IF NOT EXISTS car_slots (
  id                  SERIAL PRIMARY KEY,
  trip_group_id       INTEGER NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  vehicle_type        VARCHAR(30)  NOT NULL,          -- e.g. Sedan, Van, Mini-bus, Bus
  total_seats         INTEGER      NOT NULL,           -- max passengers this vehicle can carry
  bag_limit_per_pax   INTEGER,                        -- max bags per passenger
  bag_limit_note      TEXT,                           -- free-text bag limit description
  per_pax_cost_kwd    NUMERIC(10,2),
  pickup_location_url TEXT,                           -- optional Google Maps / location link
  pickup_time         TIME,                           -- time passengers should be at pickup
  departure_time      TIME,                           -- time vehicle departs
  status              VARCHAR(20)  NOT NULL DEFAULT 'OPEN',  -- OPEN / FULL / CANCELLED
  alsawan_note        TEXT,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- ── Passengers ───────────────────────────────────────────────────────────────
-- Created by ET. Each row = one booking entry assigned to a car slot.
CREATE TABLE IF NOT EXISTS passengers (
  id              SERIAL PRIMARY KEY,
  trip_group_id   INTEGER NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  car_slot_id     INTEGER REFERENCES car_slots(id) ON DELETE SET NULL,  -- which car they are assigned to
  name            VARCHAR(100),
  pnr             VARCHAR(20),
  ticket_number   VARCHAR(30),
  pax_count       INTEGER NOT NULL DEFAULT 1,
  bags_count      INTEGER,
  visa_status     VARCHAR(20) DEFAULT 'NOT_APPLIED',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION — run these if you already have the old schema
-- ════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS checkin_time TIME;
-- ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS checkin_date DATE;
-- ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS requested_pax INTEGER;
-- ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS requester_pnr VARCHAR(20);
-- ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS requester_ticket VARCHAR(30);
-- ALTER TABLE passengers  ADD COLUMN IF NOT EXISTS car_slot_id INTEGER REFERENCES car_slots(id) ON DELETE SET NULL;
-- DROP TABLE IF EXISTS transport_info;  -- replaced by car_slots
-- CREATE TABLE IF NOT EXISTS car_slots ( ... );  -- see above
