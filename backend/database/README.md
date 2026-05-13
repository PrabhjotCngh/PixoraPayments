# Database Setup

## PostgreSQL Installation

### macOS
```bash
brew install postgresql@15
brew services start postgresql@15
```

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

## Database Creation

```bash
# Connect to PostgreSQL
psql postgres

# Create database and user
CREATE DATABASE pixora_payments;
CREATE USER pixora_admin WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE pixora_payments TO pixora_admin;

# Connect to the database
\c pixora_payments

# Grant schema privileges
GRANT ALL ON SCHEMA public TO pixora_admin;
```

## Run Migrations

```bash
# Run the initial schema
psql -U pixora_admin -d pixora_payments -f database/migrations/001_initial_schema.sql

# Run incremental migrations in order
psql -U pixora_admin -d pixora_payments -f database/migrations/002_add_idempotency.sql
psql -U pixora_admin -d pixora_payments -f database/migrations/003_add_booth_code.sql
psql -U pixora_admin -d pixora_payments -f database/migrations/004_add_order_code.sql
psql -U pixora_admin -d pixora_payments -f database/migrations/005_add_order_tags.sql
psql -U pixora_admin -d pixora_payments -f database/migrations/006_add_booth_price.sql
psql -U pixora_admin -d pixora_payments -f database/migrations/007_add_location_cashfree_credentials.sql

# Load sample data (optional)
psql -U pixora_admin -d pixora_payments -f database/seeds/sample_data.sql
```

## Environment Variables

Add these to your `.env` file:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pixora_payments
DB_USER=pixora_admin
DB_PASSWORD=your_password_here
```

## Install Dependencies

```bash
npm install pg
```

## Verify Connection

```bash
node -e "require('./database/db').query('SELECT NOW()').then(() => process.exit(0))"
```

## Quick Commands

```bash
# Connect to database
psql -U pixora_admin -d pixora_payments

# List tables
\dt

# Describe table
\d locations
\d booths
\d orders

# View data
SELECT * FROM locations;
SELECT * FROM booths;
SELECT * FROM orders;

# Drop all tables (careful!)
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS booths CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
```
