# Booth Setup & Location Tracking Guide
## Complete Guide to Booth Registration, Location Codes, and Order Tracking

---

## 🎯 **Goal: Track Each Booth Uniquely**

We want to:
1. Register each physical booth (like "HKV Main Booth", "CP Booth 1") with a unique identifier
2. Assign each booth a **location code** (like "HKV", "CP", "GK") 
3. Assign each booth a **unique booth code** (like "HKV_BOOTH_01", "CP_BOOTH_01") 
4. Send BOTH the location code AND booth code to Cashfree with every payment order
5. Track which EXACT booth generated which order and how much revenue each booth earned

Think of it like this: If you have 5 photo booths across 3 locations (2 in HKV, 2 in CP, 1 in GK), you want to know:
- How much money **HKV location** made (both booths combined)
- How much money **HKV Booth 1** made vs **HKV Booth 2** made (individual booth tracking)

This helps you answer questions like: "Should I add more booths to HKV?" or "Is Booth 2 in CP performing poorly?"

---

## 📊 **Database Structure: The Foundation**

We use **3 main tables** to organize everything:

### 1. **`locations` Table** - The Master Location List
**File:** [backend/database/migrations/001_initial_schema.sql](backend/database/migrations/001_initial_schema.sql)

```sql
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,                         -- 
    location_key VARCHAR(50) UNIQUE NOT NULL,      -- e.g., "HKV", "CP", "GK"
    location_name TEXT NOT NULL,                   -- e.g., "Hauz Khas Village"
    city TEXT,                                     -- e.g., "New Delhi"
    active BOOLEAN DEFAULT true,                   -- Is this location operational?
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Purpose:** This is like a "master list" of all valid locations where booths can be placed.

**Example Data:**
| location_key | location_name | city | active |
|-------------|---------------|------|--------|
| HKV | Hauz Khas Village | New Delhi | true |
| CP | Connaught Place | New Delhi | true |
| GK | Greater Kailash | New Delhi | true |

**Seeded in:** [backend/database/seeds/sample_data.sql](backend/database/seeds/sample_data.sql) (line 4)

---

### 2. **`booths` Table** - Individual Booth Registration
**File:** [backend/database/migrations/001_initial_schema.sql](backend/database/migrations/001_initial_schema.sql)

```sql
CREATE TABLE booths (
    id UUID PRIMARY KEY,                    -- Unique booth ID (internal)
    booth_name TEXT NOT NULL,               -- e.g., "HKV Main Booth"
    api_key TEXT UNIQUE NOT NULL,           -- Security key (like a password)
    location_key TEXT NOT NULL,             -- Links to locations table
    booth_code TEXT UNIQUE NOT NULL,        -- UNIQUE booth identifier (e.g., "HKV_BOOTH_01")
    status TEXT DEFAULT 'active',           -- active/inactive/maintenance
    last_seen_at TIMESTAMP,                 -- Last time booth made a request
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (location_key) REFERENCES locations(location_key)
);
```

**Purpose:** Each physical booth machine gets ONE row in this table with:
- A unique API key (for security)
- A location_key (where is this booth physically located?)
- A status (is it working right now?)

**Example Data:**
| id | booth_name | api_key | location_key | booth_code | status |
|----|------------|---------|--------------|------------|--------|
| 550e8400-... | HKV Main Booth | api_hkv_main_001 | HKV | HKV_BOOTH_01 | active |
| 550e8400-... | HKV Second Booth | api_hkv_002 | HKV | HKV_BOOTH_02 | active |
| 550e8400-... | CP Booth 1 | api_cp_001 | CP | CP_BOOTH_01 | active |
| 550e8400-... | CP Booth 2 | bth_live_818b83... | CP | CP_BOOTH_02 | active |

**Notice:** Even though both "HKV Main Booth" and "HKV Second Booth" share location_key "HKV", they have DIFFERENT booth_codes (HKV_BOOTH_01, HKV_BOOTH_02). This lets you track revenue per individual booth!

**Note the FOREIGN KEY:** `location_key` must exist in the `locations` table first!

---

### 3. **`orders` Table** - Payment Orders
**File:** [backend/database/migrations/001_initial_schema.sql](backend/database/migrations/001_initial_schema.sql)

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,                    -- Internal order ID
    booth_id UUID NOT NULL,                 -- Which booth created this order?
    order_id TEXT UNIQUE NOT NULL,          -- Cashfree order ID
    location_key TEXT NOT NULL,             -- Copied from booth's location
    amount INTEGER NOT NULL,                -- Amount in paise (₹200 = 20000)
    cashfree_order_id TEXT,                 -- Cashfree's internal ID
    status TEXT DEFAULT 'pending',          -- pending/paid/failed
    idempotency_key UUID UNIQUE,            -- Prevents duplicate charges
    order_code TEXT,                        -- QR code data
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP,
    FOREIGN KEY (booth_id) REFERENCES booths(id)
);
```

**Purpose:** Every payment order is recorded here with:
- Which booth created it (`booth_id`)
- Which location it came from (`location_key`)
- Payment status (`pending` → `paid`)

---

## 🚀 **Step-by-Step: Setting Up a New Booth**

Let's say you're opening a **new photo booth at Saket (SAK)**. Here's what you do:

### **Step 1: Add the Location to Database**

**Do this FIRST** (only once per location, not per booth!)

```sql
INSERT INTO locations (location_key, location_name, city, active)
VALUES ('SAK', 'Saket', 'New Delhi', true);
```

**Why?** The `booths` table requires a valid `location_key` that exists in `locations` table.

**Where this is validated:**
- **File:** [backend/services/boothService.js](backend/services/boothService.js) (line 19-26)
```javascript
// Validate location exists and is active
const loc = await db.query(
  'SELECT location_key FROM locations WHERE location_key = $1 AND active = true',
  [location_key]
);

if (loc.rowCount === 0) {
  throw new Error(`Invalid or inactive location_key: ${location_key}`);
}
```

---

### **Step 2: Register the Booth via Admin Panel**

Open the Admin Panel(local server): `http://127.0.0.1:3000/admin.html` or production server `https://pixora.textberry.io/admin.html`

**Login credentials:**
- Username: `username`
- Password: `password`

**Screenshot Guide:**
1. Scroll to **"Booth Management"** section
2. Fill in the form:
   - **Booth Name:** "Saket Booth 1"
   - **Location Key:** "SAK"
3. Click **"Create Booth"**

**Behind the scenes (Code Flow):**

**Frontend:** [backend/bridge/admin.html](backend/bridge/admin.html) (line 398)
```javascript
async function createBooth() {
  const boothName = document.getElementById('newBoothName').value.trim();
  const locationKey = document.getElementById('newLocationKey').value.trim();

  const res = await fetch('/admin/booths', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ booth_name: boothName, location_key: locationKey })
  });
}
```

**Backend Route:** [backend/routes/adminBooths.js](backend/routes/adminBooths.js) (line 42)
```javascript
router.post('/booths', async (req, res) => {
  const { booth_name, location_key } = req.body;
  
  // Multiple booths CAN share the same location_key
  // Each booth gets a unique booth_code automatically
  
  const booth = await boothService.createBooth({
    booth_name: booth_name.trim(),
    location_key: location_key.trim()
  });
});
```

**Shared location:** Multiple booths can now share the same location.

For example, you can have:
- "CP Booth 1" with location_key "CP" → gets booth_code "CP_BOOTH_01"
- "CP Booth 2" with location_key "CP" → gets booth_code "CP_BOOTH_02"
- "CP Booth 3" with location_key "CP" → gets booth_code "CP_BOOTH_03"

Each booth at the same location gets a unique `booth_code`!

**Service Layer:** [backend/services/boothService.js](backend/services/boothService.js) (line 14)
```javascript
async function createBooth({ booth_name, location_key }) {
  // Validate location exists (Step 1 check)
  const loc = await db.query(
    'SELECT location_key FROM locations WHERE location_key = $1 AND active = true',
    [location_key]
  );

  // Generate booth ID and API key
  const boothId = uuidv4();                                          // Random UUID
  const apiKey = 'bth_live_' + crypto.randomBytes(32).toString('hex'); // 64 char hex

  // AUTO-GENERATE BOOTH CODE
  // Find highest booth number for this location and increment
  const existingBooths = await db.query(
    `SELECT booth_code FROM booths 
     WHERE location_key = $1 AND booth_code LIKE $2 
     ORDER BY booth_code DESC LIMIT 1`,
    [location_key, `${location_key}_BOOTH_%`]
  );
  
  let nextNumber = 1;
  if (existingBooths.rows.length > 0) {
    // Extract number from "CP_BOOTH_03" → get 3, add 1 → 4
    const lastCode = existingBooths.rows[0].booth_code;
    const match = lastCode.match(/_BOOTH_(\d+)$/);
    if (match) nextNumber = parseInt(match[1]) + 1;
  }
  
  const boothCode = `${location_key}_BOOTH_${String(nextNumber).padStart(2, '0')}`;
  // Examples: "CP_BOOTH_01", "HKV_BOOTH_02", "GK_BOOTH_15"

  // Insert booth into database
  await db.query(
    `INSERT INTO booths (id, booth_name, api_key, location_key, booth_code, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [boothId, booth_name, apiKey, location_key, boothCode, 'active']
  );

  return {
    booth_id: boothId,
    api_key: apiKey,       // SAVE THIS! You need it for the booth machine
    location_key,
    booth_code: boothCode  // Unique identifier for THIS specific booth
  };
}
```

**What you get back:**
```json
{
  "success": true,
  "booth": {
    "booth_id": "f4b11dc9-a7cc-4469-a492-e46b60ee7f5c",
    "booth_name": "Saket Booth 1",
    "api_key": "bth_live_dfc54778cc9592e9ea3cb79c13b3149221bc5b9d0ee27330b057ce28baa5dd79",
    "location_key": "SAK",
    "booth_code": "SAK_BOOTH_01",
    "status": "active"
  }
}
```

**🆕 Notice the booth_code:** It's automatically generated as `SAK_BOOTH_01`. If you create another Saket booth, it will be `SAK_BOOTH_02`.

**🔑 CRITICAL:** Copy the `api_key`! This is the booth's "password" - you'll need it in the booth machine.

---

### **Step 3: Configure the Booth Machine**

On the physical booth computer (the one running the Electron app), you need to save the API key so it can authenticate with the server.

**✅ Using the Built-in Configuration UI (Recommended)**

1. **Open the Configuration Screen:**
   - Press `Ctrl` + `Shift` + `C` on the booth machine
   - OR click the **⚙️ Config** button in the top-right corner of the payment screen

2. **Enter Server Details:**
   - **Server URL:** `http://127.0.0.1:3000` (or your server's URL)
   - **Booth API Key:** Paste the 64-character API key from Step 2 (starts with `bth_live_...`)

3. **Test the Connection:**
   - Click **🔍 Test Connection**
   - System will verify the API key with the server
   - If successful, you'll see:
     - Booth Name
     - Location Key
     - Booth Code
     - Status

4. **Save Configuration:**
   - Click **💾 Save Configuration**
   - Configuration is saved to: `%APPDATA%/PixoraPayments/booth-config.json` (Windows) or `~/Library/Application Support/PixoraPayments/booth-config.json` (Mac)

5. **Restart the App** (if needed)

**📁 Configuration File Location:**
The booth configuration is stored at:
- **Windows:** `C:\Users\[Username]\AppData\Roaming\PixoraPayments\booth-config.json`
- **macOS:** `~/Library/Application Support/PixoraPayments/booth-config.json`
- **Linux:** `~/.config/PixoraPayments/booth-config.json`

**Configuration File Structure:**
```json
{
  "serverUrl": "http://127.0.0.1:3000",
  "apiKey": "bth_live_dfc54778cc9592e9ea3cb79c13b3149221bc5b9d0ee27330b057ce28baa5dd79",
  "boothName": "Saket Booth 1",
  "locationKey": "SAK",
  "boothCode": "SAK_BOOTH_01"
}
```

**🔧 Keyboard Shortcuts:**
- `Ctrl` + `Shift` + `C`: Open Configuration Screen
- `Ctrl` + `Shift` + `H`: Return to Home/Payment Screen

**⚠️ Security Note:** The API key is stored in plain text locally. Keep the booth machine secure!

**Option B: Via API Call (current implementation)**

The booth machine needs to save the API key and know its location.

**File:** [frontend/.env](frontend/.env) or booth configuration
```env
BOOTH_API_KEY=bth_live_dfc54778cc9592e9ea3cb79c13b3149221bc5b9d0ee27330b057ce28baa5dd79
```

---

## 💳 **How Orders Are Created with Location Tracking**

Now when a customer pays at "Saket Booth 1", here's the flow:

### **Step 1: User Selects Payment Amount**

**Frontend:** [frontend/src/payment.html](frontend/src/payment.html)

User clicks on ₹200 package → Frontend calls:

```javascript
const result = await window.electronAPI.createOrder({
  amount: 20000,  // ₹200 in paise
  description: "Photo Session"
});
```

---

### **Step 2: Electron Preload Bridge**

**File:** [frontend/preload.js](frontend/preload.js) (line 85)

```javascript
createOrder: async (params) => {
  return await ipcRenderer.invoke('create-order', params);
}
```

---

### **Step 3: Preload Script Makes API Call**

**File:** [frontend/preload.js](frontend/preload.js) (line 72)

The preload script retrieves the stored booth configuration and makes the HTTP request directly:

```javascript
createOrder: async (amount, description) => {
  // Get booth configuration
  const boothConfig = await ipcRenderer.invoke('get-booth-config');
  if (!boothConfig.apiKey || !boothConfig.serverUrl) {
    throw new Error('Booth not configured. Please configure the booth first (Ctrl+Shift+C)');
  }

  // Generate idempotency key
  const { randomUUID } = require('crypto');
  const idempotencyKey = randomUUID();

  const url = `${boothConfig.serverUrl}/api/create-order`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${boothConfig.apiKey}`,
      'X-Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ amount, description })
  });
  return res.json();
}
```

**Implementation Complete:** The API call is made directly from the preload script using `fetch()`, not through a separate IPC handler. This is more efficient and keeps the HTTP logic in the renderer context.

---

### **Step 4: Backend Authenticates the Booth**

**Middleware:** [backend/middleware/authenticateBooth.js](backend/middleware/authenticateBooth.js)

```javascript
async function authenticateBooth(req, res, next) {
  // Extract API key from header
  const authHeader = req.headers.authorization;
  const apiKey = authHeader.replace('Bearer ', '');
  
  // Look up booth in database
  const booth = await boothService.getBoothByApiKey(apiKey);
  
  if (!booth) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  if (booth.status !== 'active') {
    return res.status(403).json({ error: 'Booth is not active' });
  }
  
  // Update last seen timestamp
  await boothService.updateBoothLastSeen(booth.id);
  
  // Attach booth info to request
  req.booth = booth;  // Contains: id, booth_name, location_key, etc.
  next();
}
```

**This is CRITICAL:** The `req.booth` object now contains both the `location_key` AND `booth_code` that will be used for the order!

---

### **Step 5: Create Order Endpoint**

**File:** [backend/routes/createOrder.js](backend/routes/createOrder.js) (line 25)

```javascript
router.post('/create-order', authenticateBooth, async (req, res) => {
  const { amount, description } = req.body;
  const idempotencyKey = req.headers['x-idempotency-key'];
  
  // Security: location_key AND booth_code come from authenticated booth ONLY
  // User cannot tamper with this - it's from the database
  const { id: booth_id, location_key, booth_code } = req.booth;
  
  // Create order with idempotency
  const result = await orderService.createOrder({
    booth_id,           // Which booth made this order
    location_key,       // Location tracking (e.g., "CP")
    booth_code,         // Individual booth tracking (e.g., "CP_BOOTH_02")
    amount,
    description,
    idempotency_key: idempotencyKey
  });
});
```

**Why this is secure:**
- The booth machine sends its API key
- Backend looks up which booth owns that API key
- Backend reads the `location_key` AND `booth_code` from the `booths` table
- User cannot fake or change the location_key or booth_code

---

### **Step 6: Order Service Creates Cashfree Order**

**File:** [backend/services/orderService.js](backend/services/orderService.js) (line 11)

```javascript
async function createCashfreeOrder({ amount, description, locationKey, boothCode }) {
  // Generate unique order ID with location prefix
  const orderId = `ORDER_${locationKey}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  // Example: "ORDER_SAK_1735923456789_a3f2b1c4"
  
  const cashfreePayload = {
    order_id: orderId,
    order_amount: (amount / 100).toFixed(2),
    order_currency: 'INR',
    order_note: description,
    customer_details: {
      customer_id: `BOOTH_${boothCode}_${Date.now()}`,  // Uses booth_code!
      customer_phone: '9999999999'
    },
    order_tags: {
      location_code: locationKey,   // Location tracking
      booth_code: boothCode         // Individual booth tracking!
    }
  };
  
  // Call Cashfree API
  const response = await axios.post(
    'https://sandbox.cashfree.com/pg/orders',
    cashfreePayload,
    {
      headers: {
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
        'x-api-version': '2025-01-01'
      }
    }
  );
}
```

**BOTH LOCATION CODE AND BOOTH CODE ARE SENT TO CASHFREE** in the `order_tags` field!

Now in your Cashfree dashboard, you can filter orders by:
- **location_code: "CP"** → See all orders from Connaught Place (all booths)
- **booth_code: "CP_BOOTH_02"** → See ONLY orders from CP Booth 2

---

### **Step 7: Save Order in Database**

**File:** [backend/services/orderService.js](backend/services/orderService.js) (line 101)

```javascript
// Insert into database
const insertQuery = `
  INSERT INTO orders (
    id, booth_id, order_id, location_key, amount,
    cashfree_order_id, status, idempotency_key, order_code, created_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
  RETURNING *
`;

const insertResult = await client.query(insertQuery, [
  orderId,                          // Random UUID
  booth_id,                         // Which booth
  cashfreeOrder.order_id,           // ORDER_SAK_1735923456789_a3f2b1c4
  location_key,                     // "SAK" - SAVED IN DATABASE!
  amount,                           // 20000 paise
  cashfreeOrder.cashfree_order_id,  // Cashfree's internal ID
  'pending',                        // Status (will update to 'paid' later)
  idempotency_key,                  // UUID to prevent duplicates
  cashfreeOrder.order_code          // QR code data
]);
```

**Now the order is in the database with the location_key saved!**

---

## **Order Status Update Flow**

After the customer pays via Cashfree, how do we know the payment succeeded?

### **Method 1: Frontend Polling (Current Implementation)**

**File:** [frontend/src/thankyou.html](frontend/src/thankyou.html)

```javascript
// Every 3 seconds, check payment status
setInterval(async () => {
  const status = await window.electronAPI.getOrder(orderId);
  
  if (status.paid) {
    // Payment successful!
    showSuccessMessage();
  }
}, 3000);
```

**Backend Endpoint:** [backend/routes/getOrder.js](backend/routes/getOrder.js) (line 26)

```javascript
router.get('/get-order/:orderId', async (req, res) => {
  const { orderId } = req.params;
  
  // Fetch status from Cashfree API
  const orderStatus = await orderService.getOrder(orderId);
  
  if (orderStatus.paid) {
    console.log('Payment successful for order:', orderId);
    
    // UPDATE DATABASE STATUS
    const dbOrder = await orderService.getOrderByCashfreeOrderId(orderId);
    if (dbOrder && dbOrder.status !== 'paid') {
      await orderService.updateOrderStatus(dbOrder.id, 'paid');
      console.log(`Order ${orderId} status updated to 'paid' in database`);
    }
  }
  
  return res.json(orderStatus);
});
```

**Service Function:** [backend/services/orderService.js](backend/services/orderService.js) (line 176)

```javascript
async function getOrder(orderId) {
  const apiUrl = 'https://sandbox.cashfree.com/pg/orders';
  
  // Ask Cashfree: "Is this order paid?"
  const response = await axios.get(`${apiUrl}/${orderId}`, {
    headers: {
      'x-client-id': process.env.CASHFREE_APP_ID,
      'x-client-secret': process.env.CASHFREE_SECRET_KEY
    }
  });
  
  return {
    success: true,
    paid: response.data.order_status === 'PAID',
    status: response.data.order_status,
    orderAmount: response.data.order_amount,
    orderId: response.data.order_id
  };
}
```

**Update Function:** [backend/services/orderService.js](backend/services/orderService.js) (line 151)

```javascript
async function updateOrderStatus(orderId, status) {
  const query = 'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
  const result = await db.query(query, [status, orderId]);
  return result.rows[0] || null;
}
```

**Helper to Find Order:** [backend/services/orderService.js](backend/services/orderService.js) (line 149)

```javascript
async function getOrderByCashfreeOrderId(cashfreeOrderId) {
  const query = 'SELECT * FROM orders WHERE order_id = $1';
  const result = await db.query(query, [cashfreeOrderId]);
  return result.rows[0] || null;
}
```

---

### **Method 2: Webhooks (NOT IMPLEMENTED YET)**

**What's missing:**
- Cashfree webhook endpoint (e.g., `POST /api/webhooks/cashfree`)
- Webhook signature verification
- Immediate status updates instead of polling

**Benefit:** Instant notification when payment succeeds, no need to poll every 3 seconds.

---

## **Tracking Revenue by Location**

Now that every order has a `location_key`, you can query:

```sql
-- Total revenue per location
SELECT 
  location_key,
  COUNT(*) as total_orders,
  SUM(amount) as total_revenue_paise,
  SUM(amount) / 100.0 as total_revenue_rupees
FROM orders
WHERE status = 'paid'
GROUP BY location_key
ORDER BY total_revenue_paise DESC;
```

**Example Result:**
| location_key | total_orders | total_revenue_rupees |
|--------------|--------------|---------------------|
| HKV | 150 | ₹30,000 |
| CP | 120 | ₹24,000 |
| SAK | 80 | ₹16,000 |

---

### **Tracking Revenue by Individual Booth**

Now that every order ALSO has a `booth_code`, you can track revenue PER BOOTH, not just per location!

```sql
-- Total revenue per individual booth
SELECT 
  booth_code,
  location_key,
  COUNT(*) as total_orders,
  SUM(amount) as total_revenue_paise,
  SUM(amount) / 100.0 as total_revenue_rupees
FROM orders
WHERE status = 'paid'
GROUP BY booth_code, location_key
ORDER BY total_revenue_paise DESC;
```

**Example Result:**
| booth_code | location_key | total_orders | total_revenue_rupees |
|------------|--------------|--------------|---------------------|
| HKV_BOOTH_01 | HKV | 95 | ₹19,000 |
| HKV_BOOTH_02 | HKV | 55 | ₹11,000 |
| CP_BOOTH_01 | CP | 80 | ₹16,000 |
| CP_BOOTH_02 | CP | 40 | ₹8,000 |
| SAK_BOOTH_01 | SAK | 80 | ₹16,000 |

**What this tells you:**
- HKV Booth 1 is doing GREAT! (₹19k)
- HKV Booth 2 is okay (₹11k)
- CP Booth 2 is underperforming (₹8k vs Booth 1's ₹16k)
  - Maybe it's in a bad spot?
  - Maybe it needs maintenance?
  - Maybe fewer people pass by it?

This helps you make business decisions:
- Should I move CP Booth 2 to a better location?
- Should I add a 3rd booth to HKV (both are performing well)?
- Should I close SAK location (only ₹16k total)?

---

**Service Function (Exists):** [backend/services/orderService.js](backend/services/orderService.js) (line 162)

```javascript
async function listOrdersByBooth(boothId, limit = 50) {
  const query = `
    SELECT * FROM orders 
    WHERE booth_id = $1 
    ORDER BY created_at DESC 
    LIMIT $2
  `;
  const result = await db.query(query, [boothId, limit]);
  return result.rows;
}
```

**MISSING:** Analytics endpoint to get revenue by location. You'd need to add:

```javascript
// backend/routes/analytics.js (DOES NOT EXIST YET)
router.get('/analytics/revenue-by-location', async (req, res) => {
  const query = `
    SELECT 
      location_key,
      COUNT(*) as total_orders,
      SUM(amount) as total_revenue_paise
    FROM orders
    WHERE status = 'paid'
    GROUP BY location_key
  `;
  const result = await db.query(query);
  res.json(result.rows);
});
```

---

## **Complete Data Flow Diagram**

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Setup (One Time Per Location)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Admin adds location:                                           │
│  INSERT INTO locations VALUES ('SAK', 'Saket', 'Delhi', true)  │
│                                                                 │
│  Admin creates booth via UI:                                    │
│  → POST /admin/booths {booth_name, location_key: 'SAK'}       │
│  → boothService.createBooth() validates location exists         │
│  → Generates: booth_id + api_key                               │
│  → INSERT INTO booths VALUES (booth_id, 'SAK Booth 1', api_key,│
│                               'SAK', 'active')                  │
│                                                                 │
│  Copy api_key to booth machine config                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Customer Makes Payment                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User clicks ₹200 package in booth UI                       │
│  2. Frontend → Electron → POST /api/create-order               │
│     Headers:                                                    │
│       Authorization: Bearer bth_live_abc123...                  │
│       X-Idempotency-Key: uuid-generated                        │
│     Body: { amount: 20000, description: "Photo" }             │
│                                                                 │
│  3. authenticateBooth middleware:                              │
│     → SELECT * FROM booths WHERE api_key = 'bth_live_abc...'  │
│     → Returns booth with location_key = 'SAK'                  │
│     → Attaches req.booth = { id, location_key: 'SAK', ... }   │
│                                                                 │
│  4. createOrder endpoint:                                       │
│     → Extracts location_key from req.booth (SECURE!)          │
│     → Calls orderService.createOrder({                         │
│         booth_id,                                              │
│         location_key: 'SAK',  ← From database, not user input!│
│         amount: 20000                                          │
│       })                                                       │
│                                                                 │
│  5. createCashfreeOrder():                                     │
│     → Generates order_id: "ORDER_SAK_1735923456789_a3f2"     │
│     → Sends to Cashfree with order_tags: {                    │
│         location_code: 'SAK'  ← TRACKED BY CASHFREE!         │
│       }                                                        │
│     → Gets back: payment_session_id, order_code (QR)          │
│                                                                 │
│  6. Save to database:                                          │
│     INSERT INTO orders VALUES (                                │
│       order_id: 'ORDER_SAK_...',                              │
│       booth_id,                                                │
│       location_key: 'SAK',  ← SAVED FOR ANALYTICS!           │
│       amount: 20000,                                           │
│       status: 'pending',                                       │
│       ...                                                      │
│     )                                                          │
│                                                                 │
│  7. Return QR code to booth UI for customer to scan            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Payment Confirmation                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frontend polls every 3 seconds:                                │
│  → GET /api/get-order/ORDER_SAK_1735923456789_a3f2            │
│                                                                 │
│  Backend:                                                       │
│  1. Calls Cashfree API: GET /pg/orders/ORDER_SAK_...          │
│  2. Cashfree returns: { order_status: 'PAID' }                │
│  3. If paid:                                                    │
│     → SELECT * FROM orders WHERE order_id = 'ORDER_SAK_...'   │
│     → UPDATE orders SET status = 'paid' WHERE id = ...         │
│     → Returns { paid: true } to frontend                       │
│                                                                 │
│  Frontend:                                                      │
│  → Sees paid: true                                             │
│  → Shows success screen                                        │
│  → Triggers photo booth app                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Revenue Analysis                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Query database:                                                │
│  SELECT location_key, SUM(amount) FROM orders                  │
│  WHERE status = 'paid'                                         │
│  GROUP BY location_key                                         │
│                                                                 │
│  Results:                                                       │
│  - SAK: ₹50,000 (250 orders)                                  │
│  - HKV: ₹80,000 (400 orders)                                  │
│  - CP: ₹60,000 (300 orders)                                   │
│                                                                 │
│  Check Cashfree dashboard → Filter by order_tags.location_code │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## **Issues Found & Recommendations**

### **1. Missing Analytics Endpoints**

No API exists for:
- Revenue by location
- Orders by date range
- Booth performance comparison

**Recommendation:** Create `backend/routes/analytics.js`

---

### **2. No Webhook Implementation**

Currently using polling (inefficient). Should implement:
- `POST /api/webhooks/cashfree`
- Signature verification
- Immediate status updates

---

## 📝 **Quick Reference: Key Files**

| Purpose | File | Key Functions |
|---------|------|---------------|
| Database Schema | `backend/database/migrations/001_initial_schema.sql` | Tables: locations, booths, orders |
| Booth Registration | `backend/services/boothService.js` | createBooth(), getBoothByApiKey() |
| Admin UI | `backend/bridge/admin.html` | Booth management interface |
| Booth Auth | `backend/middleware/authenticateBooth.js` | Validates API key, attaches booth info |
| Create Order | `backend/routes/createOrder.js` | POST /api/create-order |
| Order Service | `backend/services/orderService.js` | createOrder(), getOrder(), updateOrderStatus() |
| Status Updates | `backend/routes/getOrder.js` | GET /api/get-order/:orderId |

---

## 🎓 **Summary**

Think of it like this:

1. **Locations Table** = List of all shopping malls where you can open stores
2. **Booths Table** = Individual stores (each store has a security key/password AND a unique store number)
3. **Orders Table** = Sales receipts (which EXACT store sold what)

**Opening a new store:**
1. Add the mall to the "malls list" (locations table)
2. Register your store with the mall name (booths table)
3. System automatically gives you a store number (booth_code: "CP_BOOTH_01")
4. Get a security key (API key)
5. Give the key to your store manager

**Making a sale:**
1. Customer buys something
2. Store manager uses the security key to report the sale
3. System checks: "Which store made this sale?" (looks up the key)
4. System sees: "Oh, this is CP_BOOTH_02 at CP Mall"
5. System records: "CP_BOOTH_02 sold ₹200 at CP location"
6. Cashfree also knows it came from CP location AND Booth 2 (via order_tags)

**Checking if payment worked:**
- Every 3 seconds, ask Cashfree: "Did customer pay?"
- When Cashfree says "Yes!", update database: status = 'paid'

**Seeing total sales:**
- Count all 'paid' orders grouped by location:
  - CP Mall: ₹50,000 | HKV Mall: ₹80,000
- Count all 'paid' orders grouped by individual booth:
  - CP Booth 1: ₹30,000
  - CP Booth 2: ₹20,000 (this booth is underperforming!)
  - HKV Booth 1: ₹50,000 (this one is KILLING IT!)
  - HKV Booth 2: ₹30,000

The key innovation: **The location AND booth code come from the database (secure), not from what the user sends (can be hacked).**

**Why booth_code matters:**
Imagine you have 3 booths at CP Mall. Without booth_code, you only know "CP made ₹60k total". But WHICH booth made the most money? With booth_code, you know:
- CP_BOOTH_01: ₹25k (great!)
- CP_BOOTH_02: ₹30k (best performer!)
- CP_BOOTH_03: ₹5k (something's wrong here!)

Now you can investigate why Booth 3 is failing and fix it!

---

## ✅ **Checklist: Setting Up a New Booth**

- [ ] Add location to `locations` table (if new location)
- [ ] Open admin panel at `http://pixora.textberry.io/admin.html or http://127.0.0.1:3000/admin.html`
- [ ] Create booth with booth name + location key
- [ ] Verify booth_code was auto-generated (e.g., "HKV_BOOTH_01")
- [ ] Copy the generated API key (64 characters starting with `bth_live_`)
- [ ] Configure booth machine with API key
- [ ] Test creating an order from the booth
- [ ] Verify location_key appears in Cashfree order_tags
- [ ] Verify booth_code appears in Cashfree order_tags
- [ ] Verify order appears in database with correct location_key
- [ ] Test payment and status update
- [ ] Confirm you can track revenue for this specific booth in analytics

---

**Document Version:** 2.0 (Added booth_code tracking)  
**Last Updated:** January 13, 2026  
**Author:** Pixora Photorooms

---

## **What's New in Version 2.0?**

### **Booth Code Feature (January 4, 2026)**

**Problem:** We could track revenue by location (e.g., "CP made ₹50k"), but if CP has 3 booths, we couldn't tell which booth performed best.

**Solution:** Added `booth_code` column to booths table!
- Auto-generated format: `LOCATION_BOOTH_XX` (e.g., "CP_BOOTH_01", "HKV_BOOTH_02")
- Unique per booth (database constraint prevents duplicates)
- Sent to Cashfree in every order via `order_tags.booth_code`
- Enables per-booth revenue tracking

**Migration:** [backend/database/migrations/003_add_booth_code.sql](backend/database/migrations/003_add_booth_code.sql)

**Benefits:**
- See which specific booth is your top earner
- Identify underperforming booths that need attention
- Make data-driven decisions (add more booths to high-performing locations)
- Track maintenance impact (did revenue drop after fixing Booth 2?)

**Example:**
Before: "HKV location made ₹30k" (vague)
After: "HKV_BOOTH_01 made ₹19k, HKV_BOOTH_02 made ₹11k" (actionable!)
