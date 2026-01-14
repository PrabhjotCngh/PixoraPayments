-- Migration: Add unique booth_code to booths table
-- This allows tracking individual booth revenue in Cashfree

-- Add booth_code column
ALTER TABLE booths ADD COLUMN IF NOT EXISTS booth_code TEXT;

-- Update existing booths with booth codes using a CTE
-- Format: LOCATION_BOOTH_XX (e.g., HKV_BOOTH_01, CP_BOOTH_01)
WITH numbered_booths AS (
  SELECT 
    id,
    location_key,
    ROW_NUMBER() OVER (PARTITION BY location_key ORDER BY created_at) as booth_num
  FROM booths
  WHERE booth_code IS NULL
)
UPDATE booths
SET booth_code = nb.location_key || '_BOOTH_' || LPAD(nb.booth_num::TEXT, 2, '0')
FROM numbered_booths nb
WHERE booths.id = nb.id AND booths.booth_code IS NULL;

-- Make booth_code unique
ALTER TABLE booths ADD CONSTRAINT booths_booth_code_unique UNIQUE (booth_code);

-- Make booth_code NOT NULL after populating
ALTER TABLE booths ALTER COLUMN booth_code SET NOT NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_booths_booth_code ON booths(booth_code);

-- Verify
SELECT id, booth_name, booth_code, location_key, status FROM booths ORDER BY location_key, created_at;
