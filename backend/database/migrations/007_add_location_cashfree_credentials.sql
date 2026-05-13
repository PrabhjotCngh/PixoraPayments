-- Add per-location Cashfree credentials with env fallback support
-- Existing rows stay NULL and continue using global .env credentials

ALTER TABLE locations
ADD COLUMN IF NOT EXISTS cashfree_app_id TEXT,
ADD COLUMN IF NOT EXISTS cashfree_secret_key_encrypted TEXT,
ADD COLUMN IF NOT EXISTS cashfree_credential_env TEXT,
ADD COLUMN IF NOT EXISTS cashfree_credentials_updated_at TIMESTAMP;

-- Enforce valid environment values when present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_locations_cashfree_credential_env'
  ) THEN
    ALTER TABLE locations
    ADD CONSTRAINT check_locations_cashfree_credential_env
    CHECK (
      cashfree_credential_env IS NULL
      OR cashfree_credential_env IN ('sandbox', 'production')
    );
  END IF;
END $$;

-- Enforce both-or-neither credential pair
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_locations_cashfree_credential_pair'
  ) THEN
    ALTER TABLE locations
    ADD CONSTRAINT check_locations_cashfree_credential_pair
    CHECK (
      (cashfree_app_id IS NULL AND cashfree_secret_key_encrypted IS NULL)
      OR (cashfree_app_id IS NOT NULL AND cashfree_secret_key_encrypted IS NOT NULL)
    );
  END IF;
END $$;

-- Fast lookup for locations using custom credentials
CREATE INDEX IF NOT EXISTS idx_locations_custom_cashfree_credentials
ON locations(location_key)
WHERE cashfree_app_id IS NOT NULL AND cashfree_secret_key_encrypted IS NOT NULL;

-- Documentation comments
COMMENT ON COLUMN locations.cashfree_app_id IS 'Optional location-level Cashfree App ID. NULL means fallback to global .env CASHFREE_APP_ID';
COMMENT ON COLUMN locations.cashfree_secret_key_encrypted IS 'Encrypted location-level Cashfree Secret Key. NULL means fallback to global .env CASHFREE_SECRET_KEY';
COMMENT ON COLUMN locations.cashfree_credential_env IS 'Optional location-level Cashfree environment (sandbox|production). NULL means fallback to global .env CASHFREE_ENV';
COMMENT ON COLUMN locations.cashfree_credentials_updated_at IS 'Timestamp of latest location-level Cashfree credential update';
