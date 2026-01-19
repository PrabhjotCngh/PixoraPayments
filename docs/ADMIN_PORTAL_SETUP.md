# Admin Portal Guide - Setting Up Booths

Hey! This guide will teach you how to manage your photobooth business using the Admin Portal. You'll learn how to add locations, create booths, and get the configuration details for each booth.

---

## What is the Admin Portal?

The Admin Portal is a special webpage where **you (the business owner)** can:
- **Add new locations** (like malls, events, cafes)
- **Create booths** (the actual photobooth machines)
- **Generate API keys** (secret codes each booth uses to connect)
- **View all your booths** (see which ones are online)
- **Track booth status** (active, inactive, last seen)

Think of it like an admin panel for managing your photobooth empire!

---

## Prerequisites (What You Need)

Before starting, make sure:
1. ✅ Your **server is running** on EC2 (Step 12 in TESTING_NEW_FEATURE.md)
2. ✅ You have the **domain URL**: `https://pixora.textberry.io`
3. ✅ You have the **admin credentials**:
   - Username: `admin`
   - Password: `your_admin_password` (or your custom password from .env)
4. ✅ Your **domain is configured** and accessible

---

## Part 1: Accessing the Admin Portal

### Step 1.1: Get Your Domain URL

You have been provided with the domain:
```
https://pixora.textberry.io
```

This is your server's web address.

### Step 1.2: Open Admin Portal in Browser

1. Open **Google Chrome** or **Firefox**
2. In the address bar, type: `https://pixora.textberry.io/admin`
3. Press **Enter**

**That's it!** The admin portal loads automatically.

### Step 1.3: Log In

You'll see a browser authentication popup asking for credentials:

- **Username:** `admin`
- **Password:** `your_admin_password`

Click **Sign In** or **OK**

**What if it doesn't work?**
- Check if server is running: SSH to EC2 and run `pm2 status`
- Check security group: Make sure port 3000 is open to your IP
- Try: `curl http://localhost:3000/health` on EC2 to verify server responds

---

## Part 2: Understanding the Admin Portal Structure

The Admin Portal has **two main sections**:

### 1. Locations Section
**What it's for:** Managing the physical places where your booths are located.

**Example locations:**
- Connaught Place (CP)
- Hauz Khas Village (HKV)
- Select Citywalk Mall (SCW)

Each location gets a short "location key" like `CP`, `HKV`, `SCW`.

### 2. Booths Section
**What it's for:** Managing individual photobooth machines.

**Example booths:**
- CP Booth 1 → `CP_BOOTH_01`
- CP Booth 2 → `CP_BOOTH_02`
- HKV Booth 1 → `HKV_BOOTH_01`

Each booth gets:
- A unique booth code (auto-generated)
- An API key (secret code for that booth)
- A status (active/inactive)

---

## Part 3: Creating Your First Location

### Step 3.1: Why Create Locations First?

You **must** create a location before creating booths, because:
- Every booth needs to belong to a location
- The booth code is generated from the location key
- Example: If location key is `CP`, booths will be `CP_BOOTH_01`, `CP_BOOTH_02`, etc.

### Step 3.2: Using cURL to Create Location (Terminal Method)

Open your **terminal** (Terminal on Mac, Command Prompt on Windows).

**Command template:**
```bash
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "location_key": "LOCATION_KEY",
    "location_name": "Full Location Name",
    "city": "City Name"
  }'
```

**Real example - Creating Connaught Place location:**
```bash
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "location_key": "CP",
    "location_name": "Connaught Place",
    "city": "New Delhi"
  }'
```

**What each part means:**
- `-X POST` = We're creating something new
- `https://pixora.textberry.io/admin/locations` = The location management endpoint
- `-H "Content-Type: application/json"` = We're sending data in JSON format
- `-u admin:your_admin_password` = Admin credentials for authentication
- `location_key` = Short code (2-5 letters, UPPERCASE recommended)
- `location_name` = Human-readable name
- `city` = Which city it's in

**Expected response:**
```json
{
  "success": true,
  "location": {
    "id": "some-uuid",
    "location_key": "CP",
    "location_name": "Connaught Place",
    "city": "New Delhi",
    "created_at": "2026-01-18T10:30:00.000Z"
  }
}
```

### Step 3.3: Create More Locations (Examples)

**Hauz Khas Village:**
```bash
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "location_key": "HKV",
    "location_name": "Hauz Khas Village",
    "city": "New Delhi"
  }'
```

**Select Citywalk Mall:**
```bash
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "location_key": "SCW",
    "location_name": "Select Citywalk Mall",
    "city": "New Delhi"
  }'
```

**Khan Market:**
```bash
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "location_key": "KM",
    "location_name": "Khan Market",
    "city": "New Delhi"
  }'
```

### Step 3.4: View All Locations

**Command:**
```bash
curl https://pixora.textberry.io/admin/locations \
  -u admin:your_admin_password \
  | python3 -m json.tool
```

**Example:**
```bash
curl https://pixora.textberry.io/admin/locations \
  -u admin:your_admin_password \
  | python3 -m json.tool
```

**What this does:** Lists all locations you've created, formatted nicely.

**Expected output:**
```json
{
  "success": true,
  "locations": [
    {
      "id": "uuid-1",
      "location_key": "CP",
      "location_name": "Connaught Place",
      "city": "New Delhi"
    },
    {
      "id": "uuid-2",
      "location_key": "HKV",
      "location_name": "Hauz Khas Village",
      "city": "New Delhi"
    }
  ],
  "count": 2
}
```

---

## Part 4: Creating Booths at Locations

### Step 4.1: Understanding Booth Creation

When you create a booth, the system:
1. **Auto-generates a booth code** (like `CP_BOOTH_01`, `CP_BOOTH_02`)
2. **Generates a secure API key** (long secret string)
3. **Links it to a location** (using location_key)
4. **Sets status to active** (booth is ready to use)

### Step 4.2: Create Your First Booth

**Command template:**
```bash
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "booth_name": "Booth Name",
    "location_key": "LOCATION_KEY",
    "api_key": "optional_custom_key"
  }'
```

**Real example - Create booth at Connaught Place:**
```bash
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "booth_name": "CP Booth 1",
    "location_key": "CP",
    "api_key": "test_cp_booth_01"
  }'
```

**What each field means:**
- `booth_name` = Friendly name (can be anything, like "Main Entrance Booth")
- `location_key` = Must match an existing location (like "CP")
- `api_key` = Optional custom API key (or leave it out for auto-generation)

**Expected response:**
```json
{
  "success": true,
  "booth": {
    "id": "35a2c5aa-a475-42ba-a0b0-ad0953761eef",
    "booth_name": "CP Booth 1",
    "api_key": "bth_live_340994148d7fedd26974db7bf1e26c58e38febd1781718a2ccc5365a41d33cf0",
    "location_key": "CP",
    "booth_code": "CP_BOOTH_01",
    "status": "active",
    "created_at": "2026-01-18T10:45:00.000Z"
  }
}
```

**IMPORTANT:** Save this entire response! You'll need:
- `booth_code` → To identify this booth
- `api_key` → To configure the booth computer

### Step 4.3: Create Multiple Booths (Examples)

**Second booth at Connaught Place:**
```bash
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "booth_name": "CP Booth 2",
    "location_key": "CP",
    "api_key": "test_cp_booth_02"
  }'
```

This will get booth_code: `CP_BOOTH_02`

**First booth at Hauz Khas Village:**
```bash
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "booth_name": "HKV Booth 1",
    "location_key": "HKV",
    "api_key": "test_hkv_booth_01"
  }'
```

This will get booth_code: `HKV_BOOTH_01`

**First booth at Select Citywalk:**
```bash
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "booth_name": "SCW Mall Entrance",
    "location_key": "SCW",
    "api_key": "test_scw_booth_01"
  }'
```

This will get booth_code: `SCW_BOOTH_01`

### Step 4.4: View All Booths

**Command:**
```bash
curl https://pixora.textberry.io/admin/booths \
  -u admin:your_admin_password \
  | python3 -m json.tool
```

**Example:**
```bash
curl http://13.233.45.67:3000/admin/booths \
  -u admin:your_admin_password \
  | python3 -m json.tool
```

**Expected output:**
```json
{
  "success": true,
  "booths": [
    {
      "id": "uuid-1",
      "booth_name": "CP Booth 1",
      "api_key": "bth_live_340994...cf0",
      "location_key": "CP",
      "booth_code": "CP_BOOTH_01",
      "status": "active",
      "last_seen_at": null,
      "created_at": "2026-01-18T10:45:00.000Z"
    },
    {
      "id": "uuid-2",
      "booth_name": "CP Booth 2",
      "api_key": "bth_live_960...7288",
      "location_key": "CP",
      "booth_code": "CP_BOOTH_02",
      "status": "active",
      "last_seen_at": null,
      "created_at": "2026-01-18T10:50:00.000Z"
    }
  ],
  "count": 2
}
```

---

## Part 5: Configuring Booth Computers

### Step 5.1: What You Need for Each Booth

For every booth computer (the actual Windows/Mac machine running your Electron app), you need:

1. **Server URL**: The domain `https://pixora.textberry.io`
2. **API Key**: The booth's unique API key (from Step 4.2)

**Example booth configuration:**
```
Server URL: https://pixora.textberry.io
API Key: bth_live_340994148d7fedd26974db7bf1e26c58e38febd1781718a2ccc5365a41d33cf0
```

### Step 5.2: Configure a Booth Using Electron App

1. **Go to the booth computer** (the machine with your Electron app installed)
2. **Launch the Pixora Payments app**
3. **Press the secret key combo**: `Ctrl+Shift+C` (Windows) or `Cmd+Shift+C` (Mac)
4. A **configuration window** will appear

**What you'll see:**
```
┌─────────────────────────────────────────┐
│  Booth Configuration                    │
├─────────────────────────────────────────┤
│  Server URL:                            │
│  [https://pixora.textberry.io      ]   │
│                                          │
│  API Key:                                │
│  [bth_live_340994...cf0            ]    │
│                                          │
│  [ Test Connection ]  [ Save ]  [ Cancel ]│
└─────────────────────────────────────────┘
```

### Step 5.3: Enter Booth Credentials

1. **Server URL field:**
   - Type: `https://pixora.textberry.io`
   - This is your domain URL - just copy and paste it
   - Don't add `/api` or anything else - just the base URL

2. **API Key field:**
   - Copy the `api_key` from Step 4.2
   - Paste the ENTIRE key (it's long, around 65 characters)
   - Example: `bth_live_340994148d7fedd26974db7bf1e26c58e38febd1781718a2ccc5365a41d33cf0`

### Step 5.4: Test Connection

1. Click **"Test Connection"** button
2. The app will try to ping your server

**If successful, you'll see:**
```
✓ Connection successful!
Booth Code: CP_BOOTH_01
Location: Connaught Place
```

**If failed, you'll see an error:**
```
✗ Connection failed
Error: Cannot reach server
```

**Troubleshooting connection failures:**
- Check if domain URL is correct (should be `https://pixora.textberry.io`)
- Verify API key is complete (not truncated)
- Make sure internet connection is stable
- Try opening the domain in a browser first to verify it's accessible

### Step 5.5: Save Configuration

1. If test was successful, click **"Save"** button
2. The credentials are saved locally on that booth computer
3. The configuration window will close
4. The booth is now configured! 🎉

**Where is it saved?**
- On Windows: `%APPDATA%/pixora-payments/booth-config.json`
- On Mac: `~/Library/Application Support/pixora-payments/booth-config.json`

---

## Part 6: Testing Booth Configuration

### Step 6.1: Create a Test Order from Booth

1. **On the booth computer**, use the Electron app
2. Click **"Create Order"** or equivalent button
3. Enter test amount: `₹10.00` or `₹20.00`
4. Click **"Generate Payment Link"**

**What happens behind the scenes:**
- Booth sends API key to server
- Server identifies booth as `CP_BOOTH_01`
- Creates order linked to that booth
- Generates Cashfree payment link
- Stores booth_code in order_tags

### Step 6.2: Verify Order Was Created

On **EC2 server**, run this command:

```bash
psql -h localhost -U pixora_admin -d pixora_payments -c "
SELECT o.order_id, b.booth_code, o.amount, o.status, o.order_tags 
FROM orders o 
JOIN booths b ON o.booth_id = b.id 
ORDER BY o.created_at DESC 
LIMIT 5;
"
```

**Expected output:**
```
            order_id             | booth_code  |  amount  | status  |           order_tags           
---------------------------------+-------------+----------+---------+--------------------------------
 ORDER_CP_1768542075304_2cd17298 | CP_BOOTH_01 | 1000.00  | pending | {"booth_code":"CP_BOOTH_01","location_key":"CP"}
(1 row)
```

**Success indicators:**
- ✅ `booth_code` shows the correct booth (like `CP_BOOTH_01`)
- ✅ `order_tags` contains booth metadata (not empty `{}`)
- ✅ `status` is `pending` (waiting for payment)

---

## Part 7: Managing Booths (Advanced)

### Step 7.1: View Booth Details

Get info about a specific booth:

```bash
curl https://pixora.textberry.io/admin/booths/BOOTH_ID \
  -u admin:your_admin_password
```

Replace `BOOTH_ID` with the actual UUID from Step 4.4.

### Step 7.2: Check Which Booths Are Online

The `last_seen_at` field shows when a booth last communicated with the server.

**Command to see booth activity:**
```bash
curl http://YOUR-EC2-IP:3000/admin/booths \
  -u admin:your_admin_password \
  | python3 -m json.tool \
  | grep -A 7 "booth_name"
```

**What to look for:**
- `last_seen_at: null` = Booth never connected
- `last_seen_at: "2026-01-18T10:30:00.000Z"` = Booth was online at that time

### Step 7.3: Check Booth Revenue

See how much money each booth has made:

```bash
psql -h localhost -U pixora_admin -d pixora_payments -c "
SELECT 
  b.booth_code,
  b.booth_name,
  COUNT(o.id) as total_orders,
  SUM(o.amount) as total_revenue,
  SUM(CASE WHEN o.status = 'completed' THEN o.amount ELSE 0 END) as confirmed_revenue
FROM booths b
LEFT JOIN orders o ON b.id = o.booth_id
GROUP BY b.id, b.booth_code, b.booth_name
ORDER BY total_revenue DESC;
"
```

**Expected output:**
```
 booth_code  |  booth_name  | total_orders | total_revenue | confirmed_revenue 
-------------+--------------+--------------+---------------+-------------------
 CP_BOOTH_01 | CP Booth 1   |           45 |     450000.00 |        420000.00
 CP_BOOTH_02 | CP Booth 2   |           32 |     320000.00 |        305000.00
 HKV_BOOTH_01| HKV Booth 1  |           28 |     280000.00 |        270000.00
```

This shows you which booths are performing best! 📊

---

## Part 8: Common Admin Tasks

### Task 1: Setup a New Location

```bash
# Step 1: Create location
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "location_key": "DLF",
    "location_name": "DLF Cyber Hub",
    "city": "Gurugram"
  }'

# Step 2: Verify it was created
curl https://pixora.textberry.io/admin/locations \
  -u admin:your_admin_password \
  | grep -A 4 "DLF"
```

### Task 2: Add 3 Booths to a New Location

```bash
# Create first booth
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "booth_name": "DLF Booth 1",
    "location_key": "DLF",
    "api_key": "test_dlf_booth_01"
  }'

# Create second booth
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "booth_name": "DLF Booth 2",
    "location_key": "DLF",
    "api_key": "test_dlf_booth_02"
  }'

# Create third booth
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{
    "booth_name": "DLF Booth 3",
    "location_key": "DLF",
    "api_key": "test_dlf_booth_03"
  }'
```

They'll get booth codes: `DLF_BOOTH_01`, `DLF_BOOTH_02`, `DLF_BOOTH_03`

### Task 3: Print Configuration Sheets for Booth Technicians

After creating booths, generate a printable configuration sheet:

```bash
curl https://pixora.textberry.io/admin/booths \
  -u admin:your_admin_password \
  | python3 -m json.tool > booth_configs.json
```

This saves all booth details to `booth_configs.json` file. You can:
1. Open the file
2. Copy booth details
3. Create printable sheets for technicians

**Example sheet:**
```
┌─────────────────────────────────────────────┐
│  BOOTH CONFIGURATION SHEET                   │
├─────────────────────────────────────────────┤
│  Location: Connaught Place (CP)              │
│  Booth: CP Booth 1                           │
│  Booth Code: CP_BOOTH_01                     │
│                                               │
│  SERVER CONFIGURATION:                        │
│  URL: https://pixora.textberry.io            │
│                                               │
│  API KEY (keep secret):                       │
│  bth_live_340994148d7fedd26974db7bf1e       │
│  26c58e38febd1781718a2ccc5365a41d33cf0       │
│                                               │
│  SETUP INSTRUCTIONS:                          │
│  1. Open Pixora Payments app                 │
│  2. Press Ctrl+Shift+C                       │
│  3. Enter URL and API Key above              │
│  4. Click "Test Connection"                  │
│  5. Click "Save"                             │
└─────────────────────────────────────────────┘
```

---

## Part 9: Security Best Practices

### 9.1: Keep API Keys Secret

- ❌ **Don't** share API keys on WhatsApp/email
- ❌ **Don't** write them on sticky notes
- ✅ **Do** save them in a password manager
- ✅ **Do** use encrypted sheets for technicians

### 9.2: Change Admin Password

The default password is `your_admin_password`. You should change it:

1. SSH to EC2
2. Edit `.env` file:
```bash
cd ~/pixora/PixoraPayments/backend
nano .env
```

3. Find line: `ADMIN_PASSWORD=your_admin_password`
4. Change to: `ADMIN_PASSWORD=your_new_strong_password`
5. Save (Ctrl+X, Y, Enter)
6. Restart server: `pm2 restart pixora-backend`

### 9.3: Restrict Admin Portal Access

In production, limit who can access the admin portal:

1. **AWS Security Group**: Only allow your office IP on port 3000
2. **VPN**: Use a VPN and only allow VPN IPs
3. **HTTPS**: Use Nginx reverse proxy with SSL certificate

---

## Part 10: Troubleshooting

### Problem 1: Can't Access Admin Portal

**Symptoms:** Browser shows "Can't reach this page" or "Connection refused"

**Solutions:**
```bash
# Check if server is running
pm2 status

# Check server logs
pm2 logs pixora-backend --lines 50

# Restart server
pm2 restart pixora-backend

# Test locally on EC2
curl http://localhost:3000/health
```

### Problem 2: Location Creation Fails

**Symptoms:** Error: "Location key already exists"

**Solution:** Location keys must be unique. Check existing locations:
```bash
curl http://YOUR-EC2-IP:3000/admin/locations \
  -u admin:your_admin_password
```

### Problem 3: Booth Creation Fails

**Symptoms:** Error: "Location not found"

**Solution:** Create the location first (see Part 3)

**Symptoms:** Error: "API key already exists"

**Solution:** Use a different API key or omit the field for auto-generation

### Problem 4: Authentication Fails

**Symptoms:** "401 Unauthorized" error

**Solutions:**
- Check username is `admin`
- Check password matches your `.env` file
- Make sure password doesn't have special characters that need escaping

### Problem 5: Booth Can't Connect

**Symptoms:** Booth configuration test fails

**Solutions:**
```bash
# From booth computer, test server directly
curl http://YOUR-EC2-IP:3000/health

# From EC2, check if port 3000 is listening
sudo netstat -tuln | grep 3000

# Check AWS security group allows booth's IP
```

---

## Quick Reference Commands

### View Everything

```bash
# All locations
curl https://pixora.textberry.io/admin/locations -u admin:your_admin_password | python3 -m json.tool

# All booths
curl https://pixora.textberry.io/admin/booths -u admin:your_admin_password | python3 -m json.tool

# Recent orders
psql -h localhost -U pixora_admin -d pixora_payments -c "SELECT o.order_id, b.booth_code, o.amount, o.status FROM orders o JOIN booths b ON o.booth_id = b.id ORDER BY o.created_at DESC LIMIT 10;"
```

### Create Location

```bash
curl -X POST https://pixora.textberry.io/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{"location_key":"XXX","location_name":"Name","city":"City"}'
```

### Create Booth

```bash
curl -X POST https://pixora.textberry.io/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:your_admin_password \
  -d '{"booth_name":"Name","location_key":"XXX","api_key":"optional_key"}'
```

---

## Summary (TL;DR)

1. **Access admin portal**: `https://pixora.textberry.io/admin` (username: `admin`)
2. **Create location**: POST to `https://pixora.textberry.io/admin/locations` with location_key, name, city
3. **Create booth**: POST to `https://pixora.textberry.io/admin/booths` with booth_name, location_key
4. **Get booth API key**: From booth creation response
5. **Configure booth computer**: Press Ctrl+Shift+C, enter `https://pixora.textberry.io` as URL + API key
6. **Test**: Create order from booth, verify in database
7. **Monitor**: View orders by booth code, track revenue per booth

---

**You're ready to manage your photobooth empire! 🎪📸**

If you have questions, check the troubleshooting section or review the step-by-step instructions above.
