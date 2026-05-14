# Location Management API Endpoints

## Overview

The Location Management API manages photobooth locations and their optional location-level Cashfree credentials.

All endpoints require Basic Authentication with admin credentials.

Credential routing model:

- `default`: location uses global `.env` Cashfree credentials.
- `custom`: location uses location-level overridden credentials.

Settlement model:

- `default` routes payments to Pixora Cashfree account.
- `custom` routes payments to partner/location Cashfree account.

---

## Endpoints

### 1. GET /admin/locations

List all active locations.

```bash
curl -u admin:password https://pixora.textberry.io/admin/locations
```

Response includes safe credential metadata (never raw secret):

```json
{
  "success": true,
  "locations": [
    {
      "id": 1,
      "location_key": "CP",
      "location_name": "Connaught Place",
      "city": "New Delhi",
      "active": true,
      "created_at": "2026-01-18T10:30:00.000Z",
      "has_custom_cashfree_credentials": false,
      "credential_source": "default",
      "masked_app_id": null,
      "cashfree_credential_env": null,
      "cashfree_credentials_updated_at": null
    }
  ],
  "count": 1
}
```

---

### 2. POST /admin/locations

Create a new location.

```bash
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "location_key": "CP",
    "location_name": "Connaught Place",
    "city": "New Delhi",
    "cashfree_app_id": "optional_app_id",
    "cashfree_secret_key": "optional_secret",
    "cashfree_credential_env": "production"
  }'
```

Required fields:

- `location_key`
- `location_name`
- `city`

Optional credential fields:

- `cashfree_app_id`
- `cashfree_secret_key`
- `cashfree_credential_env` (`sandbox` or `production`)
- `clear_cashfree_credentials` (boolean; not used for create in normal flow)

If credential fields are omitted, location is created with default `.env` fallback.

---

### 3. GET /admin/locations/:key

Get location by `location_key`.

```bash
curl -u admin:password https://pixora.textberry.io/admin/locations/CP
```

Response shape matches the list endpoint item.

---

### 4. PUT /admin/locations/:key

Update location metadata and/or credential configuration.

```bash
curl -X PUT https://pixora.textberry.io/admin/locations/CP \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "location_name": "Connaught Place - Updated",
    "city": "New Delhi",
    "cashfree_app_id": "new_app_id",
    "cashfree_secret_key": "new_secret",
    "cashfree_credential_env": "sandbox"
  }'
```

Supported update fields:

- `location_name`
- `city`
- `active`
- `cashfree_app_id`
- `cashfree_secret_key`
- `cashfree_credential_env`
- `clear_cashfree_credentials` (set `true` to remove overrides and revert to default)

Clear override example:

```bash
curl -X PUT https://pixora.textberry.io/admin/locations/CP \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "clear_cashfree_credentials": true
  }'
```

---

### 5. DELETE /admin/locations/:key

Deactivate a location (soft delete).

```bash
curl -X DELETE https://pixora.textberry.io/admin/locations/CP \
  -u admin:password
```

Note: location cannot be deleted while active booths exist.

---

## Validation Rules

1. `location_key`, `location_name`, `city` are required on create.
2. `cashfree_app_id` and `cashfree_secret_key` must be provided together.
3. `cashfree_credential_env` cannot be set without custom credentials.
4. `clear_cashfree_credentials=true` cannot be combined with credential values.
5. Storing custom secret requires `CASHFREE_CREDENTIALS_MASTER_KEY` to be configured.

---

## Runtime Behavior Notes

1. Order creation resolves credentials by location:
   - custom location credentials when present
   - otherwise global `.env` fallback
2. Order status polling (`GET /api/get-order/:orderId`) resolves location from persisted order row and uses matching credential source.
3. Create-order response includes effective routing metadata:
   - `qrCode.env`
   - `qrCode.credential_source`

---

## Web UI Behavior

Admin location UI supports:

- optional custom credential fields on create
- structured edit modal for metadata + credentials
- clear override action
- gateway source visibility (`DEFAULT` / `CUSTOM`)
- masked app id and credential updated timestamp

Booth configuration UI displays read-only payment gateway status for the booth location:

- gateway source
- effective env
- masked app id

---

## Database Schema (locations)

```sql
CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  location_key VARCHAR(50) UNIQUE NOT NULL,
  location_name TEXT NOT NULL,
  city TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  cashfree_app_id TEXT,
  cashfree_secret_key_encrypted TEXT,
  cashfree_credential_env TEXT,
  cashfree_credentials_updated_at TIMESTAMP
);
```

---

## Error Response Format

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

**Common HTTP Status Codes:**

- `200 OK` - Successful GET/PUT/DELETE
- `201 Created` - Successful POST
- `400 Bad Request` - Validation error or business logic error
- `404 Not Found` - Location doesn't exist
- `500 Internal Server Error` - Database or server error
