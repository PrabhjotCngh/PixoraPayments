# QR Photo Sharing Feature - Complete Plan

## 📱 What We're Building (Simple Explanation)

Imagine you just took awesome photos at a photobooth. Instead of waiting for prints or typing your email, you just scan a QR code and BOOM! All your photos and GIF appear on your phone instantly. That's what we're building!

---

## 🎯 How It Works (Step by Step)

### **Step 1: Customer Takes Photos**
- Customer uses DSLR Photobooth software
- Takes photos and creates a fun GIF
- Clicks "Print" button

### **Step 2: Behind the Scenes Magic** ✨
- DSLR software saves:
  - **Photos** → Example: `C:\DSLRBooth\Photos\`
  - **GIF** → Example: `C:\DSLRBooth\GIFs\`

### **Step 3: Print Event Triggers**
- When customer clicks "Print", DSLR software sends a signal
- Our **Bridge** catches this signal (already built!)
- Bridge tells **QR Generator App** to wake up and start working

### **Step 4: QR Generator App Takes Over**
- Opens a full-screen window (so customer can watch)
- Shows a nice loading screen: "📸 Preparing your photos..."

### **Step 5: Upload Photos & GIF**
- App finds the **3 newest photos** in the photos folder
- Finds the **newest GIF** in the GIF folder
- Uploads them to server: `https://pixora.textberry.io/api/upload-session`
- Shows progress bar: "Uploading... 1/4 files done... 2/4 files done..."

### **Step 6: Generate QR Code**
- Server creates a unique link: `https://pixora.textberry.io/gallery/ABC123`
- QR Generator App creates a big QR code
- Displays it full-screen with message: "Scan to view your photos!"

### **Step 7: Customer Scans QR Code**
- Customer uses phone camera to scan
- Opens browser automatically
- Sees all 3 photos + 1 GIF in a beautiful gallery
- Can download, share on Instagram, WhatsApp, etc.

### **Step 8: Timer Countdown**
- QR code shows countdown: "30 seconds remaining..."
- After 30 seconds, QR Generator App closes automatically
- Launches DSLR Photobooth software again for next customer

---

## 🏗️ What We Need to Build (5 Components)

### **Component 1: Bridge Modification** (Already 80% Done!)
**File:** `backend/bridge/windows-client.js`

**What to add:**
```javascript
// When print event detected
if (eventType === 'print_complete') {
  // Launch QR Generator App
  exec('start "" "C:\\Program Files\\QRGenerator\\QRGenerator.exe"');
}
```

**Time:** 2 hours

---

### **Component 2: QR Generator App** (New Windows App)
**Technology:** Electron (same as payment app)
**Location:** New folder `qr-generator/`

**What it does:**
1. **Opens full-screen** (like kiosk mode)
2. **Finds latest files:**
   - Read `config.json` to know folder paths
   - Sort files by date, pick newest 3 photos + 1 GIF
3. **Uploads files:**
   - Shows upload progress bar
   - Sends to server API
4. **Displays QR code:**
   - Gets unique URL from server
   - Generates QR code using library
   - Shows countdown timer
5. **Closes and relaunches DSLR:**
   - After 30 seconds
   - Executes command to open DSLR software

**Time:** 3-4 days

---

### **Component 3: Server API Endpoints** (Backend)
**File:** `backend/server.js` + new route file

**New endpoints:**

#### **POST /api/upload-session**
```
Purpose: Receive photos and GIF from QR Generator App
Input: 
  - 3 photo files (multipart/form-data)
  - 1 GIF file
  - booth_id (which booth this came from)
Output:
  - session_id (unique ID like "ABC123")
  - gallery_url (https://pixora.textberry.io/gallery/ABC123)
```

#### **GET /api/gallery/:sessionId**
```
Purpose: Get all files for a session
Input: session_id
Output: List of image URLs
```

**Storage:**
- Save files to: `/home/ubuntu/pixora/uploads/sessions/{session_id}/`
- Save metadata to database table: `photo_sessions`

**Database Table:**
```sql
CREATE TABLE photo_sessions (
  id UUID PRIMARY KEY,
  session_id VARCHAR(10) UNIQUE,
  booth_id UUID REFERENCES booths(id),
  photo_1_url TEXT,
  photo_2_url TEXT,
  photo_3_url TEXT,
  gif_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Time:** 2 days

---

### **Component 4: Gallery Web Page** (Frontend)
**File:** `frontend/src/gallery.html`

**What it shows:**
- Big, beautiful display of 3 photos
- Animated GIF playing automatically
- Download buttons for each image
- Share buttons (WhatsApp, Instagram)
- Pixora branding at bottom

**Design:**
- Mobile-first (most people scan with phones)
- Swipeable photo carousel
- Full-screen image view on tap
- Auto-play GIF

**Example URL:** `https://pixora.textberry.io/gallery/ABC123`

**Time:** 2 days

---

### **Component 5: QR Generator App UI** (Electron Frontend)
**File:** `qr-generator/src/upload.html`

**Screens:**

**Screen 1: Upload Progress**
```
╔══════════════════════════════════════╗
║                                      ║
║         📸 Preparing Your            ║
║            Amazing Photos!           ║
║                                      ║
║     [████████░░░░] 60%              ║
║                                      ║
║     Uploading 3 of 4 files...       ║
║                                      ║
╚══════════════════════════════════════╝
```

**Screen 2: QR Code Display**
```
╔══════════════════════════════════════╗
║                                      ║
║      Scan to View Your Photos!       ║
║                                      ║
║         ┌─────────────┐              ║
║         │   QR CODE   │              ║
║         │   [IMAGE]   │              ║
║         └─────────────┘              ║
║                                      ║
║      ⏱️ 30 seconds remaining         ║
║                                      ║
╚══════════════════════════════════════╝
```

**Time:** 1-2 days

---

## 📂 Folder Structure (What Goes Where)

```
PixoraPayments/
├── backend/
│   ├── routes/
│   │   └── photoSessions.js          [NEW - API endpoints]
│   ├── services/
│   │   └── uploadService.js          [NEW - File upload logic]
│   └── database/
│       └── migrations/
│           └── 006_photo_sessions.sql [NEW - Database table]
│
├── frontend/
│   └── src/
│       ├── gallery.html               [NEW - Gallery page]
│       └── css/
│           └── gallery.css            [NEW - Gallery styles]
│
└── qr-generator/                      [NEW FOLDER]
    ├── main.js                        [Electron main process]
    ├── package.json
    ├── config.json                    [Folder paths config]
    └── src/
        ├── upload.html                [Upload screen]
        ├── qr-display.html            [QR code screen]
        └── js/
            ├── uploader.js            [File upload logic]
            └── qr-generator.js        [QR code generation]
```

---

## ⚙️ Configuration File

**File:** `qr-generator/config.json`

```json
{
  "folders": {
    "photos": "C:\\DSLRBooth\\Photos",
    "gifs": "C:\\DSLRBooth\\GIFs"
  },
  "server": {
    "url": "https://pixora.textberry.io",
    "apiKey": "your_booth_api_key_here"
  },
  "display": {
    "qrCodeDurationSeconds": 30,
    "autoLaunchDSLR": true,
    "dslrExePath": "C:\\Program Files\\DSLRBooth\\DSLRBooth.exe"
  }
}
```

---

## 🔧 Technical Implementation Details

### **1. Finding Latest Files (Node.js Code)**

```javascript
const fs = require('fs');
const path = require('path');

function getLatestFiles(folderPath, count = 3) {
  // Read all files in folder
  const files = fs.readdirSync(folderPath);
  
  // Get file stats (creation time, etc.)
  const filesWithStats = files.map(file => ({
    name: file,
    path: path.join(folderPath, file),
    time: fs.statSync(path.join(folderPath, file)).mtime.getTime()
  }));
  
  // Sort by newest first
  filesWithStats.sort((a, b) => b.time - a.time);
  
  // Return top 'count' files
  return filesWithStats.slice(0, count);
}

// Usage
const latestPhotos = getLatestFiles('C:\\DSLRBooth\\Photos', 3);
const latestGif = getLatestFiles('C:\\DSLRBooth\\GIFs', 1)[0];
```

### **2. Uploading Files with Progress**

```javascript
async function uploadFiles(photos, gif, onProgress) {
  const formData = new FormData();
  
  photos.forEach((photo, index) => {
    formData.append(`photo${index + 1}`, fs.createReadStream(photo.path));
  });
  
  formData.append('gif', fs.createReadStream(gif.path));
  formData.append('booth_id', boothId);
  
  const response = await axios.post(
    'https://pixora.textberry.io/api/upload-session',
    formData,
    {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        onProgress(percentCompleted);
      }
    }
  );
  
  return response.data; // { session_id, gallery_url }
}
```

### **3. Generating QR Code**

```javascript
const QRCode = require('qrcode');

async function generateQR(url) {
  const qrCodeDataURL = await QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
  
  return qrCodeDataURL; // Base64 image
}
```

### **4. Countdown Timer**

```javascript
let countdown = 30; // seconds

function startCountdown() {
  const interval = setInterval(() => {
    countdown--;
    document.getElementById('timer').textContent = 
      `${countdown} seconds remaining`;
    
    if (countdown <= 0) {
      clearInterval(interval);
      closeAndRelaunchDSLR();
    }
  }, 1000);
}

function closeAndRelaunchDSLR() {
  const { exec } = require('child_process');
  
  // Launch DSLR software
  exec('start "" "C:\\Program Files\\DSLRBooth\\DSLRBooth.exe"');
  
  // Close QR Generator app
  window.electronAPI.quitApp();
}
```

---

## 🗄️ Database Migration

**File:** `backend/database/migrations/006_photo_sessions.sql`

```sql
-- Photo Sessions Table
CREATE TABLE IF NOT EXISTS photo_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(10) UNIQUE NOT NULL,
  booth_id UUID REFERENCES booths(id),
  photo_1_url TEXT,
  photo_2_url TEXT,
  photo_3_url TEXT,
  gif_url TEXT,
  views INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_sessions_session_id ON photo_sessions(session_id);
CREATE INDEX idx_sessions_booth_id ON photo_sessions(booth_id);
CREATE INDEX idx_sessions_created_at ON photo_sessions(created_at DESC);

-- Generate short session IDs (like ABC123)
CREATE OR REPLACE FUNCTION generate_session_id() 
RETURNS VARCHAR(10) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result VARCHAR(10) := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

---

## 🌐 NGINX Configuration

**Add to:** `/etc/nginx/sites-available/pixora.textberry.io`

```nginx
# Serve uploaded photos
location /uploads/ {
    alias /home/ubuntu/pixora/uploads/;
    expires 7d;
    add_header Cache-Control "public, immutable";
}

# Gallery page
location /gallery/ {
    root /home/ubuntu/pixora/PixoraPayments/frontend/src;
    try_files /gallery.html =404;
}

# File upload endpoint (increase size limit)
location /api/upload-session {
    client_max_body_size 50M;
    proxy_pass http://localhost:3000;
}
```

---

## 📱 Mobile Gallery Page (gallery.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Pixora Photos</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, system-ui, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .container {
      max-width: 500px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      color: white;
      margin-bottom: 30px;
    }
    .photo-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
      margin-bottom: 30px;
    }
    .photo-card {
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .photo-card img {
      width: 100%;
      display: block;
    }
    .download-btn {
      display: block;
      width: 100%;
      padding: 15px;
      background: #007aff;
      color: white;
      border: none;
      font-size: 16px;
      cursor: pointer;
    }
    .gif-card {
      background: white;
      border-radius: 16px;
      padding: 20px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Your Amazing Photos!</h1>
      <p>Captured at Pixora Photorooms</p>
    </div>
    
    <div class="photo-grid" id="photoGrid"></div>
    
    <div class="gif-card">
      <h3>Your GIF Animation</h3>
      <img id="gifImage" src="" alt="GIF">
      <button class="download-btn" onclick="downloadGif()">
        Download GIF
      </button>
    </div>
  </div>
  
  <script>
    // Get session ID from URL
    const sessionId = window.location.pathname.split('/').pop();
    
    // Fetch photos
    fetch(`/api/gallery/${sessionId}`)
      .then(res => res.json())
      .then(data => {
        // Display photos
        const grid = document.getElementById('photoGrid');
        [data.photo_1_url, data.photo_2_url, data.photo_3_url]
          .forEach((url, i) => {
            grid.innerHTML += `
              <div class="photo-card">
                <img src="${url}" alt="Photo ${i+1}">
                <button class="download-btn" 
                  onclick="downloadImage('${url}', 'photo-${i+1}.jpg')">
                  Download Photo ${i+1}
                </button>
              </div>
            `;
          });
        
        // Display GIF
        document.getElementById('gifImage').src = data.gif_url;
      });
    
    function downloadImage(url, filename) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  </script>
</body>
</html>
```

---

## 🚀 Deployment Steps (On EC2 Server)

### **Step 1: Create uploads directory**
```bash
mkdir -p /home/ubuntu/pixora/uploads/sessions
chmod 755 /home/ubuntu/pixora/uploads
```

### **Step 2: Install dependencies**
```bash
cd /home/ubuntu/pixora/PixoraPayments/backend
npm install multer uuid
```

### **Step 3: Run database migration**
```bash
psql -U postgres -d pixora_payments -f backend/database/migrations/006_photo_sessions.sql
```

### **Step 4: Update NGINX config**
```bash
sudo nano /etc/nginx/sites-available/pixora.textberry.io
# Add the location blocks mentioned above
sudo nginx -t
sudo systemctl reload nginx
```

### **Step 5: Restart backend**
```bash
pm2 restart pixora-backend
```

---

## 🖥️ Windows Booth Setup Steps

### **Step 1: Build QR Generator App**
```bash
cd qr-generator
npm install
npm run build:win
```

### **Step 2: Install on booth computer**
- Copy installer to booth PC
- Install to: `C:\Program Files\QRGenerator\`
- Run once to create config file

### **Step 3: Configure folder paths**
Edit `C:\Program Files\QRGenerator\config.json`:
- Set `folders.photos` to your DSLR photos folder
- Set `folders.gifs` to your DSLR GIFs folder
- Set `server.apiKey` from admin panel

### **Step 4: Test**
- Take photos in DSLR software
- Click Print
- QR Generator should open automatically
- Upload and show QR code

---

## ⏱️ Time Estimate Breakdown

| Task | Time Needed | Difficulty |
|------|-------------|------------|
| **Backend API Endpoints** | 2 days | Medium |
| **Database Migration** | 2 hours | Easy |
| **QR Generator Electron App** | 3 days | Medium-Hard |
| **Gallery Web Page** | 2 days | Easy-Medium |
| **Bridge Modification** | 2 hours | Easy |
| **File Upload Service** | 1 day | Medium |
| **Testing & Debugging** | 2 days | Medium |
| **Documentation** | 1 day | Easy |
| **Deployment & Setup** | 1 day | Medium |

### **Total Time: 10-12 working days** (2 weeks)

With 2 developers working together: **5-6 working days** (1 week)

---

## 🎯 Success Checklist

Before calling this feature "DONE", make sure:

- [ ] QR Generator app opens when print button clicked
- [ ] App finds 3 latest photos correctly
- [ ] App finds latest GIF correctly
- [ ] Upload progress bar shows accurately
- [ ] QR code displays clearly and is scannable
- [ ] Mobile gallery page loads fast (under 2 seconds)
- [ ] All images visible on phone
- [ ] Download buttons work
- [ ] 30-second timer counts down correctly
- [ ] DSLR software relaunches automatically
- [ ] Works on slow internet (booth might have slow WiFi)
- [ ] Error handling (what if upload fails?)
- [ ] Database stores all sessions
- [ ] Admin can view session history

---

## 🐛 Common Issues & Solutions

### **Issue 1: "Cannot find latest files"**
**Solution:** Check folder paths in config.json, ensure DSLR is saving to those locations

### **Issue 2: "Upload failed"**
**Solution:** Check API key is correct, server is reachable, file size under 50MB

### **Issue 3: "QR code won't scan"**
**Solution:** Make QR code bigger (at least 300x300px), increase contrast

### **Issue 4: "Timer doesn't restart DSLR"**
**Solution:** Check DSLR exe path in config, ensure app has permissions

### **Issue 5: "Gallery page shows 'Not Found'"**
**Solution:** Check session_id is correct, files uploaded successfully

---

## 🎨 Nice-to-Have Features (Future)

- 📧 Email photos to customer
- 📱 WhatsApp direct share
- 🎨 Photo filters/effects before sharing
- 📊 Analytics dashboard (most shared sessions)
- ⭐ Customer rating/feedback
- 🎁 Promo codes in gallery
- 📺 Display last 10 sessions on TV screen

---

## 💡 Pro Tips

1. **Test with dummy files first** - Don't use real customer photos during development
2. **Keep QR code visible for 30+ seconds** - Some customers are slow to pull out phones
3. **Make gallery mobile-first** - 95% of scans will be from phones
4. **Add retry logic** - If upload fails, try again automatically
5. **Monitor disk space** - Delete old sessions after 30 days to save space
6. **Use CDN for fast loading** - Consider Cloudflare for image delivery
7. **Add analytics** - Track how many people scan QR codes

---

## 📞 Need Help?

If stuck on any step:
1. Check error logs: `pm2 logs pixora-backend`
2. Test API with Postman
3. Use Chrome DevTools for frontend debugging
4. Check NGINX error log: `sudo tail -f /var/log/nginx/error.log`

---

**Good luck building this awesome feature! 🚀**

Your customers will love seeing their photos instantly on their phones!
