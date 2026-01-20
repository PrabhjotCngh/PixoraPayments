-- Add booth pricing support
-- Allows each booth to have its own configured price

-- Add price_inr column to booths table
ALTER TABLE booths 
ADD COLUMN IF NOT EXISTS price_inr DECIMAL(10,2) DEFAULT 50.00;

-- Update existing booths to have default price if null
UPDATE booths 
SET price_inr = 50.00 
WHERE price_inr IS NULL;

-- Add NOT NULL constraint after setting defaults
ALTER TABLE booths 
ALTER COLUMN price_inr SET NOT NULL;

-- Add check constraint (price must be positive and reasonable)
ALTER TABLE booths 
ADD CONSTRAINT check_price_positive 
CHECK (price_inr > 0 AND price_inr <= 10000);

-- Add comment for documentation
COMMENT ON COLUMN booths.price_inr IS 'Photo strip price in Indian Rupees (INR) for this booth. Range: ₹1 to ₹10,000';
