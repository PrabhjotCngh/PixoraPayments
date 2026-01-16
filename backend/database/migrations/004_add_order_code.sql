-- Add order_code column to orders table
-- This column stores the unique Cashfree order code for tracking

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS order_code TEXT;

-- Create index for faster lookups by order code
CREATE INDEX IF NOT EXISTS idx_orders_order_code ON orders(order_code);
