# Location Management API - Quick Start Checklist

## ✅ Implementation Checklist

### Backend
- [x] Created `backend/services/locationService.js` with CRUD functions
- [x] Created `backend/routes/adminLocations.js` with 5 REST endpoints
- [x] Mounted routes in `backend/server.js`
- [x] All endpoints require admin authentication
- [x] Proper error handling and validation
- [x] No syntax errors

### Frontend
- [x] Added Location Management section to `backend/bridge/admin.html`
- [x] Create Location form with 3 input fields
- [x] Locations table with display and actions
- [x] JavaScript functions: loadLocations, createLocation, editLocation, updateLocation, deleteLocation
- [x] Load Locations button to fetch data

### Documentation
- [x] Created `backend/routes/LOCATION_API.md` with full API documentation
- [x] Created `LOCATION_MANAGEMENT_IMPLEMENTATION.md` with implementation summary
- [x] Created example cURL commands
- [x] Documented validation rules and error cases

---

## 🚀 Next Steps to Test

> Note on environment loading (local vs EC2): The backend now loads environment variables from `backend/.env` if present, and falls back to the project root `../.env` automatically. For EC2, keep `.env` in `backend/`. For local development, you can either place `.env` in the project root or in `backend/` — both will work consistently.

### 1. Verify Backend Routes
```bash
cd /Users/prabjot/Desktop/PixoraPayments

# Check for syntax errors
node -c backend/services/locationService.js
node -c backend/routes/adminLocations.js
node -c backend/server.js
```

### 2. Start Server (if not already running)
```bash
cd backend
npm install  # if any new packages needed (none should be)
pm2 restart pixora-backend
```

### 3. Test via cURL

**List locations:**
```bash
curl https://pixora.textberry.io/admin/locations \
  -u admin:your_admin_password
```

**Create location:**
```bash
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "location_key": "TEST",
    "location_name": "Test Location",
    "city": "Test City"
  }'
```

### 4. Test via Web UI

1. Open browser: `https://pixora.textberry.io/admin`
2. Log in with admin credentials
3. Scroll to "Location Management" section
4. Click "Load Locations" button
5. Verify table populates
6. Try "Create Location" form
7. Try "Edit" and "Delete" buttons

---

## 📋 Endpoints Summary

| Method | Endpoint | Auth | Status |
|--------|----------|------|--------|
| GET | `/admin/locations` | Basic | ✅ Ready |
| POST | `/admin/locations` | Basic | ✅ Ready |
| GET | `/admin/locations/:key` | Basic | ✅ Ready |
| PUT | `/admin/locations/:key` | Basic | ✅ Ready |
| DELETE | `/admin/locations/:key` | Basic | ✅ Ready |

---

## 📂 Files Created/Modified

### New Files
- ✅ `backend/services/locationService.js` (96 lines)
- ✅ `backend/routes/adminLocations.js` (136 lines)
- ✅ `backend/routes/LOCATION_API.md` (documentation)
- ✅ `LOCATION_MANAGEMENT_IMPLEMENTATION.md` (this summary)

### Modified Files
- ✅ `backend/server.js` (added route mounting)
- ✅ `backend/bridge/admin.html` (added UI + JavaScript)

---

## 🔒 Security

- ✅ All endpoints require HTTP Basic Auth
- ✅ Admin credentials checked via `adminAuth` middleware
- ✅ Input validation on all fields
- ✅ No SQL injection vulnerabilities
- ✅ Proper error messages without sensitive info

---

## ✨ Features Implemented

- ✅ List all active locations
- ✅ Create new location with validation
- ✅ Fetch location by key
- ✅ Update location details
- ✅ Soft delete (deactivate) locations
- ✅ Prevent deleting locations with active booths
- ✅ Normalize location keys to UPPERCASE
- ✅ Store timestamps in UTC
- ✅ Display timestamps in IST timezone
- ✅ Web UI with live loading
- ✅ Confirmation dialogs for actions

---

## 🧪 Test Scenarios

### Scenario 1: Happy Path
```
1. Create location "CP" (Connaught Place, New Delhi)
   ✓ Location created successfully
2. Load Locations
   ✓ Location appears in table
3. Create booth at CP_BOOTH_01
   ✓ Booth created with location_key="CP"
4. Try to delete location CP
   ✓ Error: "Cannot delete location with 1 active booth"
5. Deactivate booth
6. Delete location CP
   ✓ Location deactivated successfully
```

### Scenario 2: Validation
```
1. Try to create location without key
   ✓ Error: "location_key required"
2. Try to create duplicate key
   ✓ Error: "Location with this key already exists"
3. Try to create location with invalid key
   ✓ Normalized to uppercase
```

### Scenario 3: API Integration
```
1. Create location via cURL
2. Create location via Web UI
3. Edit location via API
4. Verify changes in Web UI
5. Delete location via API
```

---

## 📞 Support

If you encounter issues:

1. **Check server logs:**
   ```bash
   pm2 logs pixora-backend
   ```

2. **Verify database:**
   ```bash
   psql -h localhost -U pixora_admin -d pixora_payments -c "SELECT * FROM locations;"
   ```

3. **Test endpoint directly:**
   ```bash
   curl -v https://pixora.textberry.io/admin/locations \
     -u admin:your_password
   ```

4. **Check browser console:**
   - Open admin portal
   - Press F12 (Developer Tools)
   - Check Console for JavaScript errors

---

## 🎯 Final Checklist

- [ ] Server running (pm2 list shows pixora-backend online)
- [ ] Database accessible (psql can connect)
- [ ] Admin credentials working
- [ ] Web UI accessible at https://pixora.textberry.io/admin
- [ ] Location Management section visible
- [ ] Can create location via web UI
- [ ] Can load locations
- [ ] Can edit location
- [ ] Can delete location (with proper error when booths exist)
- [ ] cURL commands work
- [ ] No errors in pm2 logs

---

## ✅ Ready to Deploy!

Once you've tested and everything works:

```bash
# Commit changes
git add .
git commit -m "Add location management API with web UI"

# Push to main
git push origin main

# Verify on EC2
cd ~/pixora/PixoraPayments
git pull origin main
pm2 restart pixora-backend

# Test
curl https://pixora.textberry.io/admin/locations -u admin:password
```

---

**Questions? Check the documentation in `backend/routes/LOCATION_API.md`**
