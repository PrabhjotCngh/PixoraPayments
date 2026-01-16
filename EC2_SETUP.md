# EC2 Setup Guide - PixoraPayments

This guide walks you through setting up the PixoraPayments application on AWS EC2 using the AWS Console browser terminal.

## Access EC2 Terminal

1. Go to AWS Console → EC2 → Instances
2. Select your instance
3. Click "Connect" button at the top
4. Choose "EC2 Instance Connect" or "Session Manager"
5. Click "Connect" to open browser terminal

---

## Step 1: Update System Packages

```bash
sudo apt update && sudo apt upgrade -y
```

If you're using Amazon Linux instead of Ubuntu:
```bash
sudo yum update -y
```

---

## Step 2: Install PostgreSQL

### For Ubuntu/Debian:
```bash
sudo apt install postgresql postgresql-contrib -y
```

### For Amazon Linux:
```bash
sudo amazon-linux-extras install postgresql14 -y
sudo yum install postgresql-server -y
sudo postgresql-setup --initdb
```

---

## Step 3: Start PostgreSQL Service

### Ubuntu:
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl status postgresql
```

### Amazon Linux:
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl status postgresql
```

You should see "active (running)" in green.

---

## Step 4: Configure PostgreSQL

Switch to postgres user and access PostgreSQL:

```bash
sudo -i -u postgres
psql
```

You should now see the `postgres=#` prompt.

---

## Step 5: Create Database and User

Run these commands in the PostgreSQL prompt:

```sql
-- Create the database
CREATE DATABASE pixora_payments;

-- Create the admin user
CREATE USER pixora_admin WITH PASSWORD 'your_secure_password_here';

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE pixora_payments TO pixora_admin;

-- Connect to the database
\c pixora_payments

-- Grant schema privileges (PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO pixora_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pixora_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pixora_admin;

-- Exit PostgreSQL
\q
```

Exit from postgres user:
```bash
exit
```

---

## Step 6: Configure PostgreSQL for Remote Connections (if needed)

Edit PostgreSQL configuration:

```bash
sudo nano /etc/postgresql/14/main/postgresql.conf
```

Find and change:
```
listen_addresses = 'localhost'
```
to:
```
listen_addresses = '*'
```

Edit authentication file:
```bash
sudo nano /etc/postgresql/14/main/pg_hba.conf
```

Add this line before other rules:
```
host    pixora_payments    pixora_admin    0.0.0.0/0    md5
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

---

## Step 7: Test Database Connection

Test if you can connect with the new user:

```bash
psql -h localhost -U pixora_admin -d pixora_payments
```

Enter the password when prompted. If successful, you'll see the `pixora_payments=>` prompt.

Test a simple query:
```sql
SELECT version();
\l
\q
```

---

## Step 8: Install Node.js

### Ubuntu:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Amazon Linux:
```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

Verify installation:
```bash
node --version
npm --version
```

---

## Step 9: Install Git (if not already installed)

```bash
sudo apt install git -y
# or for Amazon Linux
sudo yum install git -y
```

---

## Step 10: Clone Your Repository

```bash
cd ~
git clone https://github.com/PrabhjotCngh/PixoraPayments.git
cd PixoraPayments
```

Checkout your feature branch:
```bash
git checkout feature/location_code_changes
```

---

## Step 11: Install Dependencies

```bash
cd backend
npm install
cd ..
```

---

## Step 12: Configure Environment Variables

Create backend .env file:

```bash
nano backend/.env
```

Add these variables (update with your actual values):

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pixora_payments
DB_USER=pixora_admin
DB_PASSWORD=your_secure_password_here

# Server Configuration
PORT=3000
NODE_ENV=production

# Cashfree Configuration
CASHFREE_CLIENT_ID=your_cashfree_client_id
CASHFREE_CLIENT_SECRET=your_cashfree_client_secret
CASHFREE_API_VERSION=2023-08-01

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=pixoraEC2AdminPassword
```

Save and exit (Ctrl+X, then Y, then Enter).

---

## Step 13: Run Database Migrations

```bash
cd backend

# Run migration 001 - Initial Schema
psql -h localhost -U pixora_admin -d pixora_payments -f database/migrations/001_initial_schema.sql

# Run migration 002 - Add updated_at
psql -h localhost -U pixora_admin -d pixora_payments -f database/migrations/002_add_updated_at.sql

# Run migration 003 - Add booth_code
psql -h localhost -U pixora_admin -d pixora_payments -f database/migrations/003_add_booth_code.sql
```

Enter your password when prompted for each migration.

---

## Step 14: Verify Database Schema

Connect to database and check tables:

```bash
psql -h localhost -U pixora_admin -d pixora_payments
```

Run these verification queries:

```sql
-- List all tables
\dt

-- Check locations table
\d locations

-- Check booths table (should have booth_code column)
\d booths

-- Check orders table
\d orders

-- Exit
\q
```

---

## Step 15: Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

---

## Step 16: Start the Backend Server

```bash
cd ~/PixoraPayments/backend
pm2 start server.js --name pixora-backend
pm2 save
pm2 startup
```

Follow the command that PM2 displays to enable startup on boot.

---

## Step 17: Check Server Status

```bash
pm2 status
pm2 logs pixora-backend
```

---

## Step 18: Test the API

Test health endpoint:
```bash
curl http://localhost:3000/health
```

You should see: `{"status":"ok","database":"connected"}`

---

## Testing the Booth Code System

### Test 1: Create a Location

```bash
curl -X POST http://localhost:3000/admin/locations \
  -H "Content-Type: application/json" \
  -u admin:pixoraEC2AdminPassword \
  -d '{
    "name": "Connaught Place",
    "location_key": "CP",
    "city": "New Delhi",
    "address": "CP, New Delhi"
  }'
```

### Test 2: Create Booths (booth_code auto-generated)

```bash
# Create first booth
curl -X POST http://localhost:3000/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:pixoraEC2AdminPassword \
  -d '{
    "location_key": "CP",
    "api_key": "test_api_key_cp_booth_01"
  }'

# Create second booth
curl -X POST http://localhost:3000/admin/booths \
  -H "Content-Type: application/json" \
  -u admin:pixoraEC2AdminPassword \
  -d '{
    "location_key": "CP",
    "api_key": "test_api_key_cp_booth_02"
  }'
```

### Test 3: List All Booths

```bash
curl http://localhost:3000/admin/booths \
  -u admin:pixoraEC2AdminPassword
```

You should see booth_codes like: CP_BOOTH_01, CP_BOOTH_02

### Test 4: Authenticate a Booth

```bash
curl -X POST http://localhost:3000/api/booths/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "test_api_key_cp_booth_01"
  }'
```

### Test 5: Create an Order (with booth_code)

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_api_key_cp_booth_01" \
  -d '{
    "customer_name": "Test Customer",
    "customer_phone": "9999999999",
    "customer_email": "test@example.com",
    "amount": 500
  }'
```

Check that the response includes booth_code in order_tags.

### Test 6: View Orders by Booth

```bash
psql -h localhost -U pixora_admin -d pixora_payments -c "
SELECT o.order_id, o.booth_id, b.booth_code, o.amount, o.status, o.order_tags 
FROM orders o 
JOIN booths b ON o.booth_id = b.id 
ORDER BY o.created_at DESC 
LIMIT 10;
"
```

---

## Troubleshooting

### PostgreSQL not starting:
```bash
sudo systemctl status postgresql
sudo journalctl -u postgresql
```

### Check PostgreSQL logs:
```bash
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### Backend server not responding:
```bash
pm2 logs pixora-backend
pm2 restart pixora-backend
```

### Database connection issues:
```bash
# Test connection
psql -h localhost -U pixora_admin -d pixora_payments

# Check if PostgreSQL is listening
sudo netstat -plnt | grep 5432
```

### Port already in use:
```bash
# Check what's using port 3000
sudo lsof -i :3000

# Kill process if needed
pm2 stop pixora-backend
pm2 delete pixora-backend
```

---

## Security Checklist

- [ ] Changed default database password
- [ ] Updated admin password in .env
- [ ] Configured AWS Security Group to allow only necessary ports
- [ ] Set up SSL/TLS for production
- [ ] Enabled firewall (ufw) if needed
- [ ] Regular backups configured

---

## Useful Commands

```bash
# View all PM2 processes
pm2 list

# View logs
pm2 logs pixora-backend

# Restart server
pm2 restart pixora-backend

# Stop server
pm2 stop pixora-backend

# View backend status
pm2 status

# Database backup
pg_dump -h localhost -U pixora_admin pixora_payments > backup.sql

# Database restore
psql -h localhost -U pixora_admin -d pixora_payments < backup.sql
```

---

## Next Steps After Testing

1. If all tests pass, merge to main:
   ```bash
   git checkout main
   git merge feature/location_code_changes
   git push origin main
   ```

2. On EC2, pull the main branch:
   ```bash
   cd ~/PixoraPayments
   git checkout main
   git pull origin main
   pm2 restart pixora-backend
   ```

3. Access admin panel: `http://your-ec2-ip:3000/admin`

---

## Support

- Check logs: `pm2 logs pixora-backend`
- Check database: `psql -h localhost -U pixora_admin -d pixora_payments`
- Restart server: `pm2 restart pixora-backend`
