# Testing Booth Code Feature on EC2 (Simple Guide)

Hey! Since your server is already running on EC2, we just need to switch to your new feature branch and add the booth_code system. Here's exactly what to do:

---

## What Are We Doing?

Right now, your EC2 server is running the **main branch** of your code. We want to temporarily switch to the **feature/location_code_changes branch** to test the new booth tracking system before making it permanent.

Think of it like this:
- **Main branch** = Your current working app (safe, tested)
- **Feature branch** = New booth_code feature (needs testing)

We'll test the feature, and if it works, we'll merge it to main later.

---

## Step 1: Connect to Your EC2 Instance

1. Open **AWS Console** in your browser
2. Go to **EC2 Dashboard**
3. Click on **Instances**
4. Find your instance and **select it** (click the checkbox)
5. Click the **"Connect"** button at the top
6. Choose **"EC2 Instance Connect"** tab
7. Click **"Connect"** button

You'll see a black terminal window open in your browser. This is your EC2 server's command line.

---

## Step 2: Stop Your Current Server

First, we need to stop the running server so we can update it.

```bash
pm2 list
```

**What this does:** Shows you all running processes. You should see something like "pixora-backend" or "server".

Now stop it:
```bash
pm2 stop all
```

**What this does:** Stops all running Node.js processes. Your payment app is temporarily offline (don't worry, we'll start it again soon).

---

## Step 3: Go to Your Project Folder

```bash
cd ~/PixoraPayments
```

**What this does:** Moves you into the PixoraPayments folder where your code lives.

Check where you are:
```bash
pwd
```

**What this does:** Shows your current location. You should see `/home/ubuntu/PixoraPayments` or similar.

---

## Step 4: Check Current Git Status

Let's see what branch you're on:

```bash
git branch
```

**What this does:** Shows all branches. The one with a `*` is your current branch (probably `main`).

See your current code status:
```bash
git status
```

**What this does:** Shows if you have any unsaved changes.

---

## Step 5: Pull Latest Code from GitHub

Make sure you have the latest code:

```bash
git fetch origin
```

**What this does:** Downloads all branches from GitHub without changing your current files.

---

## Step 6: Switch to the Feature Branch

Now switch to the new feature branch:

```bash
git checkout feature/location_code_changes
```

**What this does:** Switches your code to the feature branch. Your files will change to include the booth_code system.

Confirm you switched:
```bash
git branch
```

You should see a `*` next to `feature/location_code_changes` now.

Pull the latest changes:
```bash
git pull origin feature/location_code_changes
```

**What this does:** Makes sure you have the absolute latest code from this branch.

---

## Step 7: Install Any New Dependencies

The new feature might need new npm packages:

```bash
cd backend
npm install
```

**What this does:** Installs any new Node.js packages needed for the booth_code feature.

---

## Step 8: Install and Configure PostgreSQL

If you haven't installed PostgreSQL yet, follow these steps. If you already have PostgreSQL running, skip to Step 9.

### 8.1: Install PostgreSQL

For Ubuntu/Debian (most common):
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib -y
```

For Amazon Linux:
```bash
sudo amazon-linux-extras install postgresql14 -y
sudo yum install postgresql-server -y
sudo postgresql-setup --initdb
```

**What this does:** Downloads and installs PostgreSQL database on your EC2 server.

### 8.2: Start PostgreSQL Service

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**What this does:** Starts PostgreSQL and makes it start automatically when your server reboots.

Check if it's running:
```bash
sudo systemctl status postgresql
```

You should see "active (running)" in green. Press `q` to exit.

### 8.3: Access PostgreSQL

Switch to the postgres user:
```bash
sudo -i -u postgres
```

**What this does:** Logs you in as the "postgres" user (PostgreSQL's admin user).

Now access the PostgreSQL command line:
```bash
psql
```

You should see a prompt like `postgres=#`

### 8.4: Create Your Database

In the PostgreSQL prompt, run these commands ONE BY ONE:

```sql
CREATE DATABASE pixora_payments;
```

**What this does:** Creates a new database called "pixora_payments" for your app.

### 8.5: Create Database User

```sql
CREATE USER pixora_admin WITH PASSWORD 'your_secure_password_here';
```

**IMPORTANT:** Replace `your_secure_password_here` with a strong password. Write it down - you'll need it!

**What this does:** Creates a user account that your Node.js app will use to connect to the database.

### 8.6: Give User Permissions

```sql
GRANT ALL PRIVILEGES ON DATABASE pixora_payments TO pixora_admin;
```

**What this does:** Gives your user full access to the database.

Now connect to your new database:
```sql
\c pixora_payments
```

You should see: "You are now connected to database "pixora_payments"

Grant schema permissions:
```sql
GRANT ALL ON SCHEMA public TO pixora_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pixora_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pixora_admin;
```

**What this does:** Gives your user permission to create and modify tables.

### 8.7: Exit PostgreSQL

```sql
\q
```

Then exit from postgres user:
```bash
exit
```

You're back to your normal ubuntu user now.

### 8.8: Test Database Connection

Let's make sure you can connect with your new user:

```bash
psql -h localhost -U pixora_admin -d pixora_payments
```

**Important:** It will ask for the password you created in Step 8.5. Type it (you won't see anything as you type - this is normal).

If successful, you'll see `pixora_payments=>` prompt.

Test it works:
```sql
SELECT version();
```

You should see PostgreSQL version info. Now exit:
```sql
\q
```

### 8.9: Update Your .env File

Make sure your backend/.env file has the correct database credentials:

```bash
cd ~/PixoraPayments/backend
nano .env
```

Check/update these lines:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pixora_payments
DB_USER=pixora_admin
DB_PASSWORD=your_secure_password_here
```

**Replace `your_secure_password_here`** with the password you created!

Save and exit (Ctrl+X, then Y, then Enter).

---

## Step 9: Run Database Migrations

Now that PostgreSQL is set up, let's create all the tables!

### 9.1: Run Migration 001 (Initial Schema)

This creates your locations, booths, orders, and payments tables:

```bash
cd ~/PixoraPayments/backend
psql -h localhost -U pixora_admin -d pixora_payments -f database/migrations/001_initial_schema.sql
```

Enter your password when asked.

**What this does:** Creates all the main tables your app needs.

You should see messages like:
```
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE INDEX
```

### 9.2: Run Migration 002 (Add Idempotency)

```bash
psql -h localhost -U pixora_admin -d pixora_payments -f database/migrations/002_add_idempotency.sql
```

**What this does:** Adds idempotency_key column to prevent duplicate orders and adds foreign key constraints.

### 9.3: Run Migration 003 (Add Booth Codes)

```bash
psql -h localhost -U pixora_admin -d pixora_payments -f database/migrations/003_add_booth_code.sql
```

**What this does:** Adds the booth_code column - the new feature we're testing!

You should see:
```
ALTER TABLE
UPDATE 0
ALTER TABLE
CREATE INDEX
```

The "UPDATE 0" is normal if you don't have any booths yet.

### 9.4: Verify All Tables Exist

```bash
psql -h localhost -U pixora_admin -d pixora_payments -c "\dt"
```

**What this does:** Lists all tables in your database.

You should see:
- locations
- booths
- orders

### 9.5: Check Booth Table Structure

```bash
psql -h localhost -U pixora_admin -d pixora_payments -c "\d booths"
```

**What this does:** Shows the structure of your booths table.

**IMPORTANT:** Look for a column called `booth_code`. If you see it, the migration worked! ✅

---

## Step 10: Add Sample Location (Optional but Recommended)

Let's create a test location so you can create booths:

```bash
psql -h localhost -U pixora_admin -d pixora_payments << EOF
INSERT INTO locations (location_key, location_name, city) 
VALUES ('CP', 'Connaught Place', 'New Delhi');
EOF
```

**What this does:** Creates a test location. You can create booths here now.

Verify it was created:
```bash
psql -h localhost -U pixora_admin -d pixora_payments -c "SELECT * FROM locations;"
```

---

## Step 11: Restart Your Server

Now start the server with the new code:

```bash
cd ~/PixoraPayments/backend
pm2 restart all
```

**What this does:** Restarts your Node.js server with the new booth_code feature.

If that doesn't work (because no processes were running before):
```bash
pm2 start server.js --name pixora-backend
```

Check if it's running:
```bash
pm2 status
```

You should see "online" in green.

Check the logs for errors:
```bash
pm2 logs --lines 50
```

**What this does:** Shows the last 50 lines of server output. Look for any red error messages.

---

## Step 12: Test the Server Health

Let's make sure the server is working:

```bash
curl http://localhost:3000/health
```

**What this does:** Pings your server's health endpoint.

**Expected result:** 
```json
{"status":"running","environment":"production","appIdPresent":true,"secretPresent":true}
```

If you see `"status":"running"` with Cashfree credentials present, your server is working correctly!

---

## Step 13: Test the Booth Code Feature

### Test A: Create a New Booth (Booth Code Auto-Generates!)

```bash
curl -X POST http://localhost:3000/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:pixoraEC2AdminPassword \
  -d '{
    "booth_name": "CP Booth 1",
    "location_key": "CP",
    "api_key": "test_cp_booth_01"
  }'
```

**What this does:** Creates a new booth at CP location with a name. The system will automatically assign it a booth_code like `CP_BOOTH_01`.

**Expected result:** JSON with `booth_code` field showing something like `CP_BOOTH_01`

### Test B: List All Booths (See Booth Codes)

```bash
curl http://localhost:3000/admin/booths -u admin:pixoraEC2AdminPassword | python3 -m json.tool
```

**What this does:** Gets all booths and formats the output nicely.

**Expected result:** List of booths, each with a `booth_code` field.

### Test C: Create an Order (With Booth Tracking!)

First, get a booth's API key from Test B. Then:

```bash
curl -X POST http://localhost:3000/api/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer bth_live_340994148d7fedd26974db7bf1e26c58e38febd1781718a2ccc5365a41d33cf0" \
  -H "X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "amount": 20000,
    "description": "Pixora Photo Session"
  }'
```

**Replace the values:**
- API key in Authorization header with actual API key from Test B
- X-Idempotency-Key with a unique UUID (to prevent duplicate orders)
- amount in paise (20000 = ₹200)

**What this does:** Creates an order using booth authentication. The order will be tagged with the booth_code.

**Expected result:** JSON response with order_id and Cashfree payment session details, including booth_code tracking.

### Test D: Check Orders by Booth

```bash
psql -h localhost -U pixora_admin -d pixora_payments -c "
SELECT o.order_id, b.booth_code, o.amount, o.status, o.order_tags 
FROM orders o 
JOIN booths b ON o.booth_id = b.id 
ORDER BY o.created_at DESC 
LIMIT 5;
"
```

**What this does:** Shows your latest 5 orders with their booth codes.

**Expected result:** Table showing orders tagged with specific booth codes (like CP_BOOTH_01, HKV_BOOTH_02, etc.)

---

## Step 14: Test with Your Electron App

If you want to test the booth configuration feature with your Electron app:

1. **Open the Electron app** on a booth computer
2. **Press Ctrl+Shift+C** (this opens booth configuration)
3. **Enter your EC2 server URL**: `http://your-ec2-ip:3000`
4. **Enter a booth API key** (from Test B above)
5. **Click "Test Connection"**
6. **If successful, click "Save"**
7. **Try creating a test order** (₹10 or ₹20)
8. **Check if the order appears** with the booth code

---

## Step 15: Verify Everything Works

Run this comprehensive check:

```bash
psql -h localhost -U pixora_admin -d pixora_payments << EOF
-- Check booth codes
SELECT 'Booths:' as check_type;
SELECT id, location_key, booth_code FROM booths ORDER BY id;

-- Check recent orders with booth codes
SELECT 'Recent Orders:' as check_type;
SELECT o.order_id, b.booth_code, o.amount, o.status 
FROM orders o 
JOIN booths b ON o.booth_id = b.id 
ORDER BY o.created_at DESC 
LIMIT 10;
EOF
```

**What this does:** Shows all your booths and recent orders in one go.

---

## What If Something Goes Wrong?

### Server won't start:
```bash
pm2 logs pixora-backend --lines 100
```
Look for red error messages and see what's wrong.

### Database error:
```bash
psql -h localhost -U pixora_admin -d pixora_payments -c "SELECT version();"
```
This checks if database is accessible.

### Need to go back to main branch:
```bash
cd ~/PixoraPayments
pm2 stop all
git checkout main
cd backend
pm2 restart all
```

This switches back to your old working code.

---

## Understanding What Changed

Here's what the booth_code feature adds:

### Before (Main Branch):
- Multiple booths at same location shared same `location_key`
- No way to track which specific booth made which sale
- Orders only knew the location, not the exact booth

### After (Feature Branch):
- Each booth gets unique code: `CP_BOOTH_01`, `CP_BOOTH_02`, etc.
- Orders are tagged with exact booth code
- You can see revenue per individual booth
- Cashfree receives booth code in order tags
- Booth configuration UI lets you save credentials locally

---

## When You're Done Testing

### If Everything Works Great:

**Option 1: Keep testing**
```bash
# Your feature branch is now live on EC2
# Keep testing and monitoring for a day or two
pm2 logs pixora-backend
```

**Option 2: Merge to main branch**

On your **local computer** (not EC2):
```bash
cd ~/Desktop/PixoraPayments
git checkout main
git merge feature/location_code_changes
git push origin main
```

Then on **EC2**:
```bash
cd ~/PixoraPayments
git checkout main
git pull origin main
pm2 restart all
```

### If Something Breaks:

Switch back to main:
```bash
cd ~/PixoraPayments
pm2 stop all
git checkout main
pm2 restart all
```

Your old working system is back!

---

## Quick Command Reference

| What You Want | Command |
|---------------|---------|
| Check server status | `pm2 status` |
| View server logs | `pm2 logs` |
| Restart server | `pm2 restart all` |
| Check which branch | `git branch` |
| Switch to main | `git checkout main` |
| Switch to feature | `git checkout feature/location_code_changes` |
| Test server | `curl http://localhost:3000/health` |
| Check database | `psql -h localhost -U pixora_admin -d pixora_payments` |

---

## Summary (TL;DR)

1. Connect to EC2 via AWS Console
2. Stop server: `pm2 stop all`
3. Go to project: `cd ~/PixoraPayments`
4. Switch branch: `git checkout feature/location_code_changes`
5. Install packages: `cd backend && npm install`
6. Run migration: `psql -h localhost -U pixora_admin -d pixora_payments -f database/migrations/003_add_booth_code.sql`
7. Restart server: `pm2 restart all`
8. Test: `curl http://localhost:3000/health`
9. Create test booth and order (commands in Step 11)
10. Verify booth codes work correctly

**You're testing a new feature without permanently changing your main code. If it works, merge it. If not, switch back to main branch!**

---

Good luck! 🚀 You got this!
