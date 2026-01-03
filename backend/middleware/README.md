# Booth Authentication

## Overview

Booth authentication middleware ensures that:
- ✅ Every booth request is authenticated via API key
- ✅ Disabled/maintenance booths are blocked
- ✅ `location_key` is resolved server-side (no spoofing)
- ✅ `last_seen_at` is updated automatically (heartbeat)
- ✅ Revenue cannot be spoofed across locations

## Implementation

**Middleware:** `backend/middleware/authenticateBooth.js`

### How It Works

1. **Extracts API key** from `Authorization: Bearer <api_key>` header
2. **Validates booth** exists and is `active`
3. **Checks location assignment** (booth must have a `location_key`)
4. **Updates heartbeat** (`last_seen_at = NOW()`)
5. **Attaches booth info** to `req.booth` for downstream handlers

### Usage

Apply middleware to any route that requires booth authentication:

```javascript
const authenticateBooth = require('./middleware/authenticateBooth');

// Protect endpoint
router.post('/api/orders', authenticateBooth, (req, res) => {
  const booth = req.booth; // Access authenticated booth
  
  // booth.id - UUID
  // booth.name - Booth name
  // booth.location_key - Location key (server-verified)
  // booth.status - Always 'active' (guaranteed by middleware)
  
  // Create order logic...
});
```

## API Responses

### Success (200)
```json
{
  "success": true,
  "message": "Booth authenticated successfully",
  "booth": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "HKV Main Booth",
    "location_key": "HKV",
    "status": "active"
  }
}
```

### Missing API Key (401)
```json
{
  "success": false,
  "error": "Missing booth API key. Use: Authorization: Bearer <api_key>"
}
```

### Invalid API Key (403)
```json
{
  "success": false,
  "error": "Invalid booth API key"
}
```

### Inactive Booth (403)
```json
{
  "success": false,
  "error": "Booth not active (status: maintenance)",
  "booth_id": "1d97a180-4441-4b5c-8b31-53b3a1e76d69",
  "booth_name": "CP Booth 2"
}
```

### No Location Assignment (400)
```json
{
  "success": false,
  "error": "Booth is not assigned to a location. Contact admin.",
  "booth_id": "..."
}
```

## Testing

### Test Commands

```bash
# 1. No API key (should return 401)
curl http://127.0.0.1:3000/api/booth/info

# 2. Invalid API key (should return 403)
curl -H "Authorization: Bearer invalid_key" \
  http://127.0.0.1:3000/api/booth/info

# 3. Valid API key (should return 200)
curl -H "Authorization: Bearer api_hkv_main_001" \
  http://127.0.0.1:3000/api/booth/info

# 4. Inactive booth (should return 403)
curl -H "Authorization: Bearer <maintenance_booth_key>" \
  http://127.0.0.1:3000/api/booth/info
```

### Run Test Script

```bash
node backend/test-booth-auth.js
```

### Verify Heartbeat

```bash
psql -U pixora_admin -d pixora_payments \
  -c "SELECT booth_name, last_seen_at FROM booths WHERE id = 'YOUR_BOOTH_ID';"
```

## Security Features

1. **API Key Format:** `bth_live_<64-char-hex>` (generated server-side)
2. **Location Lock:** `location_key` cannot be overridden by client
3. **Status Check:** Only `active` booths can make requests
4. **Heartbeat:** Track booth activity via `last_seen_at`
5. **Request Logging:** All auth attempts logged server-side

## Admin Operations

### Get All Booths
```bash
curl -u admin:password http://127.0.0.1:3000/admin/booths
```

### Create New Booth
```bash
curl -u admin:password -X POST \
  -H "Content-Type: application/json" \
  -d '{"booth_name":"New Booth","location_key":"HKV"}' \
  http://127.0.0.1:3000/admin/booths
```

### Update Booth Status
```bash
curl -u admin:password -X PUT \
  -H "Content-Type: application/json" \
  -d '{"status":"maintenance"}' \
  http://127.0.0.1:3000/admin/booths/BOOTH_ID
```

### Regenerate API Key
```bash
curl -u admin:password -X POST \
  http://127.0.0.1:3000/admin/booths/BOOTH_ID/regenerate-key
```

## Best Practices

1. **Always apply middleware** to revenue-critical endpoints
2. **Never expose API keys** in client-side code
3. **Use HTTPS** in production to protect API keys in transit
4. **Monitor `last_seen_at`** to detect offline booths
5. **Regularly rotate API keys** for security
6. **Set booth status to `maintenance`** instead of deleting

## Integration Example

```javascript
// Create order endpoint (protected)
router.post('/api/create-order', authenticateBooth, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const booth = req.booth; // Authenticated booth info
    
    // Create order with verified location
    const order = await createOrder({
      booth_id: booth.id,
      location_key: booth.location_key, // Server-verified
      amount,
      description
    });
    
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## Next Steps

1. Apply `authenticateBooth` to `/api/create-order` endpoint
2. Create `orders` table to track transactions
3. Add order service with booth_id and location_key
4. Implement revenue reports grouped by location
