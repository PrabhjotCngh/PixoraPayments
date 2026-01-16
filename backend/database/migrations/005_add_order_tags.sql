-- Add order_tags column to orders table
-- This column stores JSON tags including booth_code and other metadata

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS order_tags JSONB DEFAULT '{}'::jsonb;

-- Create index for faster JSONB queries
CREATE INDEX IF NOT EXISTS idx_orders_tags ON orders USING GIN (order_tags);
