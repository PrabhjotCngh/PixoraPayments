-- Add idempotency_key column to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- Create index for faster idempotency lookups
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key);

-- Add foreign key constraint if not exists (for data integrity)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_booth'
  ) THEN
    ALTER TABLE orders
    ADD CONSTRAINT fk_booth
    FOREIGN KEY (booth_id)
    REFERENCES booths(id)
    ON DELETE SET NULL;
  END IF;
END $$;
