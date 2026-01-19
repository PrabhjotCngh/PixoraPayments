# Location Management API Endpoints

## Overview
The Location Management API provides endpoints for managing photobooth locations. All endpoints require **Basic Authentication** with admin credentials.

---

## Endpoints

### 1. GET /admin/locations
**List all active locations**

```bash
curl -u admin:password https://pixora.textberry.io/admin/locations
```

**Response:**
```json
{
  "success": true,
  "locations": [
    {
      "id": "uuid-1",
      "location_key": "CP",
      "location_name": "Connaught Place",
      "city": "New Delhi",
      "active": true,
      "created_at": "2026-01-18T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

---

### 2. POST /admin/locations
**Create a new location**

```bash
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "location_key": "CP",
    "location_name": "Connaught Place",
    "city": "New Delhi"
  }'
```

**Required Fields:**
- `location_key` - Short code (2-5 letters, UPPERCASE) - e.g., "CP", "HKV"
- `location_name` - Full name of location - e.g., "Connaught Place"
- `city` - City name - e.g., "New Delhi"

**Response:**
```json
{
  "success": true,
  "location": {
    "id": "uuid-1",
    "location_key": "CP",
    "location_name": "Connaught Place",
    "city": "New Delhi",
    "active": true,
    "created_at": "2026-01-18T10:30:00.000Z"
  }
}
```

**Error Cases:**
- ❌ Missing required fields → `400 Bad Request`
- ❌ Duplicate location_key → `400 Bad Request` ("Location with this key already exists")

---

### 3. GET /admin/locations/:key
**Get location details by location_key**

```bash
curl -u admin:password https://pixora.textberry.io/admin/locations/CP
```

**Response:**
```json
{
  "success": true,
  "location": {
    "id": "uuid-1",
    "location_key": "CP",
    "location_name": "Connaught Place",
    "city": "New Delhi",
    "active": true,
    "created_at": "2026-01-18T10:30:00.000Z"
  }
}
```

**Error Cases:**
- ❌ Location not found → `404 Not Found`

---

### 4. PUT /admin/locations/:key
**Update location details**

```bash
curl -X PUT https://pixora.textberry.io/admin/locations/CP \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "location_name": "Connaught Place - New Delhi",
    "city": "New Delhi",
    "active": true
  }'
```

**Optional Fields:**
- `location_name` - Update location name
- `city` - Update city
- `active` - Set to `true` or `false`

**Response:**
```json
{
  "success": true,
  "location": {
    "id": "uuid-1",
    "location_key": "CP",
    "location_name": "Connaught Place - New Delhi",
    "city": "New Delhi",
    "active": true,
    "created_at": "2026-01-18T10:30:00.000Z"
  }
}
```

**Error Cases:**
- ❌ No fields provided → `400 Bad Request`
- ❌ Location not found → `400 Bad Request`

---

### 5. DELETE /admin/locations/:key
**Deactivate a location (soft delete)**

```bash
curl -X DELETE https://pixora.textberry.io/admin/locations/CP \
  -u admin:password
```

**Response:**
```json
{
  "success": true,
  "message": "Location \"CP\" has been deactivated",
  "location": {
    "id": "uuid-1",
    "location_key": "CP",
    "location_name": "Connaught Place",
    "city": "New Delhi",
    "active": false,
    "created_at": "2026-01-18T10:30:00.000Z"
  }
}
```

**Important:** You cannot delete a location that has active booths. You must deactivate all booths first.

**Error Cases:**
- ❌ Location has active booths → `400 Bad Request` ("Cannot delete location with X active booth(s)")
- ❌ Location not found → `400 Bad Request`

---

## Usage Examples

### Example 1: Create a location and add booths

```bash
# Step 1: Create location
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "location_key": "HKV",
    "location_name": "Hauz Khas Village",
    "city": "New Delhi"
  }'

# Step 2: Create booth at that location
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "booth_name": "HKV Booth 1",
    "location_key": "HKV"
  }'

# Step 3: Create another booth at same location
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "booth_name": "HKV Booth 2",
    "location_key": "HKV"
  }'
```

### Example 2: Update location details

```bash
curl -X PUT https://pixora.textberry.io/admin/locations/HKV \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "location_name": "Hauz Khas Village - Delhi",
    "city": "New Delhi"
  }'
```

### Example 3: Deactivate a location

```bash
# First deactivate all booths at location
curl -X PUT https://pixora.textberry.io/admin/booths/booth-id \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{"status": "inactive"}'

# Then deactivate the location
curl -X DELETE https://pixora.textberry.io/admin/locations/HKV \
  -u admin:password
```

---

## Authentication

All endpoints require **HTTP Basic Authentication**:

```
Authorization: Basic base64(username:password)
```

**Default credentials:**
- Username: `admin`
- Password: (from `.env` file - default: `password`)

---

## Database Schema

Locations are stored in the `locations` table:

```sql
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_key TEXT UNIQUE NOT NULL,
  location_name TEXT NOT NULL,
  city TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Validation Rules

1. **location_key:**
   - Must be 2-5 characters
   - Must be UPPERCASE
   - Must be unique
   - Used to generate booth codes (e.g., `CP_BOOTH_01`)

2. **location_name:**
   - Must be non-empty
   - No length restrictions
   - User-friendly name for display

3. **city:**
   - Must be non-empty
   - Helps organize locations geographically

---

## Integration with Booths

- Every booth must reference an existing location via `location_key`
- Booth codes are auto-generated from location_key (e.g., `CP_BOOTH_01`, `CP_BOOTH_02`)
- Cannot delete a location with active booths
- Deactivating a location sets `active = false` but keeps historical data

---

## Web UI

The admin portal includes a Location Management section with:

- **List all locations** - See all active locations
- **Create location** - Add new location with key, name, city
- **Edit location** - Update name and city (key is immutable)
- **Delete location** - Deactivate location (if no active booths)

Access at: `https://pixora.textberry.io/admin`

---

## Error Handling

All endpoints return consistent error responses:

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
