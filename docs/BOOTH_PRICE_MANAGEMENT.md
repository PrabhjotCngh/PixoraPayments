# Booth Price Management Feature - Complete Plan

## 📝 What We're Building (Simple Explanation)

Right now, all photobooths charge the same price (like ₹200 for everyone). But what if one booth is at a fancy mall and should charge ₹400, while another is at a college fest and should charge ₹300? 

We're building a feature where you (the admin) can set different prices for each booth, and customers will automatically pay that booth's specific price!

---

## 🎯 Current vs New System

### **Current System (What We Have Now)**
- All booths charge the same price: ₹200 (hardcoded in config)
- To change price, you need to edit code and rebuild app
- No way to have different prices for different booths

### **New System (What We're Building)**
- Each booth can have its own custom price
- Admin sets price from web panel (no coding needed!)
- Price stored in database
- Booth automatically fetches its price when starting
- Different locations can have different pricing strategies

### **Example Scenarios:**
- **Connaught Place Mall booth** → ₹300 (premium location)
- **Hauz Khas Village booth** → ₹200 (popular hangout)
- **College Campus booth** → ₹150 (student discount)

---

## 🏗️ Architecture Overview

```
Admin Panel (Web)
    ↓
[Set Price for Booth A = ₹200]
    ↓
Server Database
    ↓
[booth_id: "abc-123", price: 200]
    ↓
Booth A App (Windows)
    ↓
[Fetch my price on startup]
    ↓
Customer pays ₹200
```

---

## 📊 Database Changes

### **Step 1: Add `price` Column to `booths` Table**

**Current `booths` table:**
```sql
booths (
  id UUID,
  booth_name TEXT,
  api_key TEXT,
  location_key VARCHAR(50),
  booth_code VARCHAR(10),
  status TEXT,
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP
)
```

**New `booths` table (with price):**
```sql
booths (
  id UUID,
  booth_name TEXT,
  api_key TEXT,
  location_key VARCHAR(50),
  booth_code VARCHAR(10),
  status TEXT,
  price_inr DECIMAL(10,2) DEFAULT 200.00,  -- NEW COLUMN!
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP
)
```

**Migration File:** `backend/database/migrations/006_add_booth_price.sql`

```sql
-- Add price column to booths table
ALTER TABLE booths 
ADD COLUMN IF NOT EXISTS price_inr DECIMAL(10,2) DEFAULT 200.00;

-- Update existing booths to have default price
UPDATE booths 
SET price_inr = 200.00 
WHERE price_inr IS NULL;

-- Add NOT NULL constraint after setting defaults
ALTER TABLE booths 
ALTER COLUMN price_inr SET NOT NULL;

-- Add check constraint (price must be positive and reasonable)
ALTER TABLE booths 
ADD CONSTRAINT check_price_positive 
CHECK (price_inr > 0 AND price_inr <= 10000);

-- Add comment for documentation
COMMENT ON COLUMN booths.price_inr IS 'Photo strip price in Indian Rupees (INR) for this booth';
```

**Why decimal(10,2)?**
- `10` = total digits (like ₹99999999.99 max)
- `2` = decimal places (for paise: ₹50.50)
- Prevents rounding errors with money

---

## 🖥️ Admin Panel Changes

### **Step 2A: Update Booths Table Display**

**File:** `backend/bridge/admin.html`

**Current table columns:**
```
Booth Name | Location Key | Booth Code | API Key | Status | Last Seen | Created | Actions
```

**New table columns (add Price):**
```
Booth Name | Location Key | Booth Code | Price (₹) | API Key | Status | Last Seen | Created | Actions
```

**Code change in `displayBooths()` function:**

```javascript
function displayBooths(booths) {
  const tbody = document.getElementById('boothsTableBody');
  
  tbody.innerHTML = booths.map(booth => {
    const price = booth.price_inr || 200.00; // Default to ₹200 if not set
    
    return `
      <tr>
        <td>${escapeHtml(booth.booth_name)}</td>
        <td><code>${escapeHtml(booth.location_key)}</code></td>
        <td><code style="color:#007aff;">${escapeHtml(booth.booth_code || 'N/A')}</code></td>
        
        <!-- NEW: Price column -->
        <td style="padding:8px;border:1px solid #ddd;font-weight:600;">
          <span style="color:#34c759;">₹${price.toFixed(2)}</span>
        </td>
        
        <td>
          <span style="display:inline-flex;align-items:center;gap:8px;">
            <span>${booth.api_key.substring(0, 20)}...</span>
            <button onclick='copyToClipboard("${escapeHtml(booth.api_key)}", this)'>
              📋 Copy
            </button>
          </span>
        </td>
        <td>Status badge...</td>
        <td>Last seen...</td>
        <td>Created...</td>
        <td>
          <button onclick='editBooth(${JSON.stringify(booth)})'>Edit</button>
          <button onclick='regenerateKey("${booth.id}", "${escapeHtml(booth.booth_name)}")'>Regenerate Key</button>
          <button onclick='deleteBooth("${booth.id}", "${escapeHtml(booth.booth_name)}")'>Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}
```

### **Step 2B: Update Edit Modal**

**Add price input field to edit modal:**

```javascript
<div id="editModal" style="...">
  <h3>Edit Booth</h3>
  
  <div class="row">
    <label>Booth Name:</label>
    <input id="editBoothName" type="text" />
  </div>
  
  <div class="row">
    <label>Location Key:</label>
    <input id="editLocationKey" type="text" disabled readonly />
  </div>
  
  <!-- NEW: Price input -->
  <div class="row">
    <label>Price (₹ INR):</label>
    <input id="editPrice" type="number" step="0.01" min="1" max="10000" 
      placeholder="200.00" required 
      style="width:100%;max-width:300px;" />
    <small style="color:#666;font-size:11px;">
      Price in Indian Rupees (e.g., 200.00 for ₹200)
    </small>
  </div>
  
  <div class="row">
    <label>Status:</label>
    <select id="editStatus">
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
      <option value="maintenance">Maintenance</option>
    </select>
  </div>
  
  <div class="row">
    <button onclick="updateBooth()">Save Changes</button>
    <button onclick="closeEditModal()">Cancel</button>
  </div>
</div>
```

### **Step 2C: Update Edit Booth Function**

**Populate price field when editing:**

```javascript
function editBooth(booth) {
  document.getElementById('editBoothId').value = booth.id;
  document.getElementById('editBoothName').value = booth.booth_name;
  document.getElementById('editLocationKey').value = booth.location_key;
  document.getElementById('editPrice').value = booth.price_inr || 200.00; // NEW
  document.getElementById('editStatus').value = booth.status;
  
  document.getElementById('editModal').style.display = 'block';
  document.getElementById('modalBackdrop').style.display = 'block';
}
```

### **Step 2D: Update Save Function**

**Send price when updating booth:**

```javascript
async function updateBooth() {
  const boothId = document.getElementById('editBoothId').value;
  const boothName = document.getElementById('editBoothName').value.trim();
  const priceInr = parseFloat(document.getElementById('editPrice').value); // NEW
  const status = document.getElementById('editStatus').value;
  
  if (!boothName || !priceInr || priceInr <= 0) {
    log('❌ Booth name and valid price are required');
    return;
  }
  
  try {
    const response = await fetch(`/api/admin/booths/${boothId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getStoredAuthHeader()
      },
      body: JSON.stringify({
        booth_name: boothName,
        price_inr: priceInr,  // NEW
        status: status
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      log(`✓ Booth "${boothName}" updated with price ₹${priceInr.toFixed(2)}`);
      closeEditModal();
      loadBooths(); // Refresh table
    } else {
      throw new Error(data.error || 'Update failed');
    }
  } catch (error) {
    log(`❌ Failed to update booth: ${error.message}`);
  }
}
```

### **Step 2E: Add Price to Create Booth Form**

**Update create booth form:**

```html
<form onsubmit="event.preventDefault();createBooth();">
  <h3>Create New Booth</h3>
  
  <div class="row">
    <label>Booth Name:</label>
    <input id="newBoothName" type="text" placeholder="e.g., HKV Main Booth" required />
  </div>
  
  <div class="row">
    <label>Location Key:</label>
    <input id="newBoothLocationKey" type="text" placeholder="e.g., HKV" required />
  </div>
  
  <!-- NEW: Price input for new booths -->
  <div class="row">
    <label>Price (₹ INR):</label>
    <input id="newBoothPrice" type="number" step="0.01" min="1" max="10000" 
      value="200.00" required 
      placeholder="200.00" />
    <small style="color:#666;">Default: ₹200.00</small>
  </div>
  
  <div class="row">
    <button type="submit">Create Booth</button>
  </div>
</form>
```

**Update `createBooth()` function:**

```javascript
async function createBooth() {
  const boothName = document.getElementById('newBoothName').value.trim();
  const locationKey = document.getElementById('newBoothLocationKey').value.trim();
  const priceInr = parseFloat(document.getElementById('newBoothPrice').value); // NEW
  
  if (!boothName || !locationKey || !priceInr) {
    log('❌ All fields are required');
    return;
  }
  
  try {
    const response = await fetch('/api/admin/booths', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getStoredAuthHeader()
      },
      body: JSON.stringify({
        booth_name: boothName,
        location_key: locationKey,
        price_inr: priceInr  // NEW
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      log(`✓ Booth "${boothName}" created with price ₹${priceInr.toFixed(2)}`);
      
      // Clear form
      document.getElementById('newBoothName').value = '';
      document.getElementById('newBoothLocationKey').value = '';
      document.getElementById('newBoothPrice').value = '200.00'; // Reset to default
      
      loadBooths(); // Refresh table
    } else {
      throw new Error(data.error || 'Creation failed');
    }
  } catch (error) {
    log(`❌ Failed to create booth: ${error.message}`);
  }
}
```

---

## 🔧 Backend API Changes

### **Step 3A: Update Create Booth Endpoint**

**File:** `backend/routes/adminBooths.js`

**Current POST /api/admin/booths:**
```javascript
router.post('/booths', async (req, res) => {
  const { booth_name, location_key } = req.body;
  
  // Insert booth...
});
```

**Updated with price:**
```javascript
router.post('/booths', async (req, res) => {
  const { booth_name, location_key, price_inr = 50.00 } = req.body; // NEW: default ₹50
  
  // Validate price
  if (price_inr <= 0 || price_inr > 10000) {
    return res.status(400).json({
      success: false,
      error: 'Price must be between ₹1 and ₹10,000'
    });
  }
  
  try {
    const query = `
      INSERT INTO booths (id, booth_name, api_key, location_key, price_inr, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'active', NOW())
      RETURNING *
    `;
    
    const result = await db.query(query, [
      uuidv4(),
      booth_name,
      generateApiKey(),
      location_key,
      price_inr  // NEW
    ]);
    
    res.json({
      success: true,
      booth: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### **Step 3B: Update Edit Booth Endpoint**

**File:** `backend/routes/adminBooths.js`

**Current PUT /api/admin/booths/:id:**
```javascript
router.put('/booths/:id', async (req, res) => {
  const { booth_name, status } = req.body;
  
  // Update booth...
});
```

**Updated with price:**
```javascript
router.put('/booths/:id', async (req, res) => {
  const { id } = req.params;
  const { booth_name, status, price_inr } = req.body; // NEW
  
  // Validate price if provided
  if (price_inr !== undefined && (price_inr <= 0 || price_inr > 10000)) {
    return res.status(400).json({
      success: false,
      error: 'Price must be between ₹1 and ₹10,000'
    });
  }
  
  try {
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (booth_name) {
      updates.push(`booth_name = $${paramIndex++}`);
      values.push(booth_name);
    }
    
    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    
    if (price_inr !== undefined) {  // NEW
      updates.push(`price_inr = $${paramIndex++}`);
      values.push(price_inr);
    }
    
    values.push(id); // Last parameter is booth ID
    
    const query = `
      UPDATE booths 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await db.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Booth not found'
      });
    }
    
    res.json({
      success: true,
      booth: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### **Step 3C: Update Booth Info Endpoint**

**File:** `backend/middleware/authenticateBooth.js`

**Current response (no price):**
```javascript
router.get('/api/booth/info', authenticateBooth, (req, res) => {
  res.json({
    success: true,
    booth_name: req.booth.booth_name,
    booth_code: req.booth.booth_code,
    location_key: req.booth.location_key,
    status: req.booth.status
  });
});
```

**Updated response (with price):**
```javascript
router.get('/api/booth/info', authenticateBooth, (req, res) => {
  res.json({
    success: true,
    booth_name: req.booth.booth_name,
    booth_code: req.booth.booth_code,
    location_key: req.booth.location_key,
    status: req.booth.status,
    price_inr: req.booth.price_inr || 200.00  // NEW: Send booth's price
  });
});
```

### **Step 3D: Update Create Order Endpoint**

**File:** `backend/routes/createOrder.js`

**Current (uses fixed amount from request):**
```javascript
router.post('/create-order', authenticateBooth, async (req, res) => {
  const { amount, description, idempotency_key } = req.body;
  
  // Create order with amount from request...
});
```

**Updated (uses booth's price from database):**
```javascript
router.post('/create-order', authenticateBooth, async (req, res) => {
  const { description, idempotency_key } = req.body;
  
  // Get booth's configured price (in INR)
  const boothPriceInr = req.booth.price_inr || 200.00;
  
  // Convert to paise (₹1 = 100 paise)
  const amountInPaise = Math.round(boothPriceInr * 100);
  
  try {
    const order = await orderService.createOrder({
      booth_id: req.booth.id,
      location_key: req.booth.location_key,
      booth_code: req.booth.booth_code,
      amount: amountInPaise,  // Use booth's configured price
      description: description || 'Pixora Photo Session',
      idempotency_key
    });
    
    res.json({
      success: true,
      order: order.order,
      payment_session_id: order.payment_session_id,
      amount_inr: boothPriceInr,  // Send back amount for display
      order_code: order.order_code
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

**Key change:** Amount is no longer sent from the booth app. The server determines the amount based on the booth's configured price in the database.

---

## 💻 Booth App Changes

### **Step 4A: Fetch Booth Price on Startup**

**File:** `frontend/src/payment.html`

**Current (uses hardcoded amount):**
```javascript
window.addEventListener('DOMContentLoaded', async () => {
  const config = await window.electronAPI.getConfig();
  const amountInRupees = 200; // HARDCODED!
  await generateQRCode(amountInRupees);
});
```

**Updated (fetches booth's price from server):**
```javascript
let boothPriceInr = 200.00; // Default fallback

window.addEventListener('DOMContentLoaded', async () => {
  // Check if booth configured
  const boothConfig = await window.electronAPI.getBoothConfig();
  if (!boothConfig || !boothConfig.apiKey) {
    openBoothConfig();
    return;
  }
  
  // Fetch booth info including price
  try {
    const response = await fetch(`${boothConfig.serverUrl}/api/booth/info`, {
      headers: {
        'Authorization': `Bearer ${boothConfig.apiKey}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      boothPriceInr = data.price_inr || 200.00; // Get booth's configured price
      console.log(`[payment] Booth price: ₹${boothPriceInr}`);
      
      // Update UI if there's a price display element
      const priceDisplay = document.getElementById('priceDisplay');
      if (priceDisplay) {
        priceDisplay.textContent = `₹${boothPriceInr.toFixed(2)}`;
      }
    }
  } catch (error) {
    console.error('[payment] Failed to fetch booth info:', error);
    // Use default price if fetch fails
  }
  
  // Generate QR with booth's price
  await generateQRCode(boothPriceInr);
});
```

### **Step 4B: Update Create Order API Call**

**File:** `frontend/preload.js`

**Current (sends amount from app):**
```javascript
ipcMain.handle('create-order', async (event, amount, description) => {
  const response = await axios.post(
    `${serverUrl}/api/create-order`,
    {
      amount: amount,  // Sent from app
      description: description,
      idempotency_key: idempotencyKey
    },
    {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }
  );
  
  return response.data;
});
```

**Updated (server determines amount):**
```javascript
ipcMain.handle('create-order', async (event, description) => {
  // NOTE: Amount removed! Server will use booth's configured price
  
  const response = await axios.post(
    `${serverUrl}/api/create-order`,
    {
      description: description || 'Pixora Photo Session',
      idempotency_key: idempotencyKey
    },
    {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }
  );
  
  return response.data;
});
```

**Update caller in payment.html:**

```javascript
async function generateQRCode(displayPrice) {
  try {
    // Create order (amount determined by server based on booth config)
    const res = await window.electronAPI.createOrder('Pixora Photo Session');
    
    if (!res?.success) {
      throw new Error('Invalid response from server');
    }
    
    // Server returns actual amount charged
    console.log(`[payment] Order created for ₹${res.amount_inr}`);
    
    // Generate QR code
    const cashfree = Cashfree({ mode: res.env });
    cashfree.checkout({
      paymentSessionId: res.payment_session_id,
      redirectTarget: "_self",
      paymentMethod: { upi: { flow: "qr" } }
    });
  } catch (error) {
    console.error('[payment] Failed to generate QR:', error);
  }
}
```

### **Step 4C: Add Price Display in UI (Optional)**

**File:** `frontend/src/payment.html`

**Add price display above QR code:**

```html
<body>
  <div class="container">
    
    <!-- NEW: Price display -->
    <div style="text-align:center;margin-bottom:20px;">
      <h2 style="color:white;font-size:28px;margin:0;">
        Complete Payment
      </h2>
      <p style="color:rgba(255,255,255,0.8);font-size:20px;margin:10px 0;">
        Amount: <strong id="priceDisplay">₹50.00</strong>
      </p>
    </div>
    
    <div id="qr-code-wrapper" class="qr-code-wrapper loading">
      <div class="loader"></div>
      <div id="upi-qr"></div>
    </div>
    
  </div>
</body>
```

---

## 🧪 Testing Checklist

### **Database Testing**
- [ ] Migration runs successfully
- [ ] Default price (₹200) set for existing booths
- [ ] Price constraint works (rejects ₹0, ₹-10, ₹99999)
- [ ] Decimal precision correct (₹50.50 stored properly)

### **Admin Panel Testing**
- [ ] Create new booth with custom price (e.g., ₹75)
- [ ] Price displays correctly in booths table
- [ ] Edit existing booth's price
- [ ] Price validation works (rejects invalid inputs)
- [ ] Price updates reflect immediately after save

### **Backend API Testing**
- [ ] POST /api/admin/booths with price works
- [ ] PUT /api/admin/booths/:id updates price
- [ ] GET /api/booth/info returns correct price
- [ ] POST /api/create-order uses booth's configured price
- [ ] Price validation returns proper error messages

### **Booth App Testing**
- [ ] App fetches booth price on startup
- [ ] Price displays correctly in UI
- [ ] Order created with correct amount
- [ ] Cashfree receives correct price
- [ ] Payment QR shows correct amount

### **Integration Testing**
- [ ] Create booth with ₹100 price → Customer pays ₹100
- [ ] Update booth to ₹80 → Customer pays ₹80
- [ ] Multiple booths with different prices work independently
- [ ] Booth app shows updated price after server change (needs restart)

---

## 📝 Branching Strategy

### **Step-by-Step Git Workflow**

**1. Create feature branch from main:**
```bash
git checkout main
git pull origin main
git checkout -b feature/set-booth-price-from-admin
```

**2. Make changes in order:**

**Phase 1: Database (1 hour)**
```bash
# Create migration file
touch backend/database/migrations/007_add_booth_price.sql
# Edit migration
# Test migration locally
git add backend/database/migrations/007_add_booth_price.sql
git commit -m "feat: add price_inr column to booths table with migration"
```

**Phase 2: Backend API (2 hours)**
```bash
# Update admin routes
# Update booth info endpoint
# Update create order endpoint
git add backend/routes/adminBooths.js backend/routes/createOrder.js
git commit -m "feat: add price management to admin API endpoints"
```

**Phase 3: Admin Panel UI (2 hours)**
```bash
# Update admin.html
# Add price input fields
# Update display functions
git add backend/bridge/admin.html
git commit -m "feat: add booth price management UI to admin panel"
```

**Phase 4: Booth App (1 hour)**
```bash
# Update preload.js
# Update payment.html
# Add price display
git add frontend/preload.js frontend/src/payment.html
git commit -m "feat: fetch and display booth-specific pricing in payment app"
```

**Phase 5: Documentation (30 mins)**
```bash
# Update README or add docs
git add docs/BOOTH_PRICE_MANAGEMENT.md
git commit -m "docs: add booth price management feature documentation"
```

**3. Push to GitHub:**
```bash
git push origin feature/set-booth-price-from-admin
```

**4. Create Pull Request:**
- Go to GitHub
- Create PR from `feature/set-booth-price-from-admin` to `main`
- Add description of changes
- Request review (if applicable)

**5. After review, merge to main:**
```bash
git checkout main
git merge feature/set-booth-price-from-admin
git push origin main
```

**6. Deploy to production:**
```bash
# SSH to EC2
ssh ubuntu@pixora.textberry.io

# Pull latest changes
cd /home/ubuntu/pixora/PixoraPayments
git pull origin main

# Run migration
psql -U postgres -d pixora_payments -f backend/database/migrations/007_add_booth_price.sql

# Restart backend
pm2 restart pixora-backend

# Verify
pm2 logs pixora-backend
```

---

## ⏱️ Time Estimate

| Task | Time | Difficulty |
|------|------|------------|
| **Database migration** | 1 hour | Easy |
| **Backend API updates** | 2 hours | Medium |
| **Admin panel UI** | 2 hours | Easy-Medium |
| **Booth app changes** | 1 hour | Easy |
| **Testing** | 2 hours | Medium |
| **Documentation** | 30 mins | Easy |
| **Deployment** | 30 mins | Easy |

**Total Time: 9 hours (1 working day for experienced developer)**

---

## 🚀 Deployment Steps

### **On EC2 Server**

**1. Backup database (IMPORTANT!):**
```bash
pg_dump -U postgres pixora_payments > backup_$(date +%Y%m%d_%H%M%S).sql
```

**2. Pull latest code:**
```bash
cd /home/ubuntu/pixora/PixoraPayments
git pull origin main
```

**3. Run migration:**
```bash
psql -U postgres -d pixora_payments -f backend/database/migrations/007_add_booth_price.sql
```

**4. Verify migration:**
```bash
psql -U postgres -d pixora_payments -c "\d booths"
# Should show price_inr column
```

**5. Restart backend:**
```bash
pm2 restart pixora-backend
pm2 logs --lines 50
```

**6. Test admin panel:**
- Open `https://pixora.textberry.io/admin`
- Login
- Check if booths table shows Price column
- Edit a booth and change price
- Verify change saved

**7. Test booth app (on Windows PC):**
- Rebuild app: `npm run build:win`
- Install on booth PC
- Run app
- Check if price displays correctly
- Test payment with new price

---

## 🎯 Success Criteria

Feature is complete when:

✅ **Database:**
- Migration runs without errors
- All booths have price column
- Price constraints work correctly

✅ **Admin Panel:**
- Can create booth with custom price
- Can edit booth price
- Price displays in table
- Validation prevents invalid prices

✅ **Backend API:**
- Booth info endpoint returns price
- Create order uses booth's price
- Different booths can have different prices

✅ **Booth App:**
- Fetches price from server
- Displays price in UI
- Creates orders with correct amount
- Customers pay booth-specific price

✅ **Documentation:**
- Feature documented
- Migration instructions clear
- Testing checklist complete

---

## 💡 Future Enhancements

Once basic feature works, consider:

1. **Pricing Tiers:**
   - Weekend vs weekday pricing
   - Peak hour surcharges
   - Happy hour discounts

2. **Bulk Price Updates:**
   - Update all booths in a location
   - Apply percentage increase/decrease
   - Schedule price changes

3. **Price History:**
   - Track price changes over time
   - Analytics on revenue per booth
   - Optimal pricing suggestions

4. **Dynamic Pricing:**
   - Auto-adjust based on demand
   - Special event pricing
   - Integration with calendar

5. **Promotional Pricing:**
   - Discount codes
   - First-customer discounts
   - Bundle deals (3 strips for ₹120)

---

## 🐛 Common Issues & Solutions

### **Issue 1: "Migration fails - column already exists"**
**Solution:**
```sql
-- Check if column exists first
ALTER TABLE booths 
ADD COLUMN IF NOT EXISTS price_inr DECIMAL(10,2);
```

### **Issue 2: "Price not updating in booth app"**
**Solution:** Booth app caches price. Restart app or add auto-refresh:
```javascript
setInterval(async () => {
  // Refresh booth info every 5 minutes
  const info = await fetchBoothInfo();
  boothPriceInr = info.price_inr;
}, 5 * 60 * 1000);
```

### **Issue 3: "Negative price accepted"**
**Solution:** Add frontend validation:
```javascript
if (price <= 0) {
  alert('Price must be greater than ₹0');
  return;
}
```

### **Issue 4: "Decimal places not showing"**
**Solution:** Use `.toFixed(2)`:
```javascript
const priceDisplay = `₹${price.toFixed(2)}`; // ₹50.00 instead of ₹50
```

---

## 📞 Support

If you encounter issues:
1. Check server logs: `pm2 logs pixora-backend`
2. Check database: `psql -U postgres -d pixora_payments`
3. Verify migration ran: `SELECT price_inr FROM booths LIMIT 1;`
4. Test API directly with curl or Postman
5. Check booth app console logs

---

**That's it! You now have complete control over booth pricing from the admin panel! 🎉**

Each booth can have its own price, and customers automatically pay the right amount for that specific location.
