-- Initial schema for Pixora Payments
-- Run this migration to create the core tables

-- Locations table: stores physical location data
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  location_key VARCHAR(50) UNIQUE NOT NULL,
  location_name TEXT NOT NULL,
  city TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Booths table: represents individual photo booth devices
CREATE TABLE IF NOT EXISTS booths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  location_key VARCHAR(50),
  status TEXT DEFAULT 'active',
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_location
    FOREIGN KEY (location_key)
    REFERENCES locations(location_key)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

-- Orders table: tracks payment transactions
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID,
  order_id TEXT UNIQUE NOT NULL,
  location_key TEXT,
  amount DECIMAL(10,2) NOT NULL,
  cashfree_order_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_booth
    FOREIGN KEY (booth_id)
    REFERENCES booths(id)
    ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_booths_location_key ON booths(location_key);
CREATE INDEX IF NOT EXISTS idx_booths_status ON booths(status);
CREATE INDEX IF NOT EXISTS idx_orders_booth_id ON orders(booth_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_cashfree_id ON orders(cashfree_order_id);
