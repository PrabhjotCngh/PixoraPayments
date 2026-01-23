# Pixora Bridge - Installation Guide (User Guide)

## 📦 What is Pixora Bridge?

Pixora Bridge is a local service that connects your photobooth software (dslrBooth) with the Pixora payment system. It automatically launches the payment app when a customer starts a session.

---

## 🚀 Quick Installation (Non-Technical Users)

### **Step 1: Download**
1. Go to [Releases](https://github.com/PrabhjotCngh/PixoraPayments/releases)
2. Download `PixoraBridge.exe` from the latest release

### **Step 2: Install**
1. Create a folder: `C:\PixoraBridge`
2. Copy `PixoraBridge.exe` to this folder
3. Download `bridge-config.env` template and save it in the same folder

### **Step 3: Configure**
1. Open `bridge-config.env` in Notepad
2. Update the photobooth path (In most cases we don't need to update the path):
   ```
   PHOTOBOOTH_APP_PATH=C:\Program Files\dslrBooth\dslrBooth.exe
   ```
3. Save and close

### **Step 4: Run**
1. Double-click `PixoraBridge.exe`
2. A console window will open showing "Bridge server running on port 4000"
3. Keep this window open while using the photobooth

### **Step 5: Auto-Start (Optional)**
To run automatically on Windows startup:
1. Press `Win + R`
2. Type: `shell:startup`
3. Create a shortcut to `PixoraBridge.exe` in the Startup folder

---

## 🔧 Configuration Options

Edit `bridge-config.env` to customize:

```env
# Path to your photobooth software
PHOTOBOOTH_APP_PATH=C:\Program Files\dslrBooth\dslrBooth.exe

# Pixora Payments app path (auto-detected, only set if needed)
# PIXORA_EXE=C:\Users\YourName\AppData\Local\Programs\PixoraPayments\PixoraPayments.exe

# Port for bridge server (default: 4000)
BRIDGE_PORT=4000

# Credit expiry time in seconds (default: 1800 = 30 minutes)
PIXORA_CREDIT_TTL_SEC=1800

# Enable detailed logging for troubleshooting
CLIENT_VERBOSE_LOGS=true
```

---

## 🐛 Troubleshooting

### **Bridge won't start**
- Check if port 4000 is already in use
- Run as Administrator
- Check `bridge-debug.log` for errors

### **Payment app doesn't launch**
- Verify PixoraPayments is installed
- Check the path in `PIXORA_EXE` (if set)
- Look for errors in `bridge-debug.log`

### **Photobooth doesn't start**
- Verify the path in `PHOTOBOOTH_APP_PATH`
- Make sure dslrBooth is installed
- Check if file exists at that location

---

## 📝 Logs

The bridge creates a log file: `bridge-debug.log` in the same folder as `PixoraBridge.exe`

Check this file for:
- Payment events
- App launch status
- Error messages
- Credit management

---

## 🔄 Updating

1. Download the new `PixoraBridge.exe`
2. Stop the running bridge (close the console window)
3. Replace the old `.exe` with the new one
4. Start the bridge again

---

## 💻 Developer Installation (Technical Users)

If you want to run from source:

```bash
# Clone the repository
git clone https://github.com/PrabhjotCngh/PixoraPayments.git
cd PixoraPayments

# Install dependencies
npm install

# Configure .env file
# Edit backend/.env with your settings

# Run the bridge
npm run bridge:localClient
```

---

## 📦 Building from Source

To create your own `PixoraBridge.exe`:

```bash
npm run build:bridge
```

The executable will be created in `dist/PixoraBridge.exe`

---

## 🆘 Support

If you encounter issues:

1. Check `bridge-debug.log` for errors
2. Verify all paths in `bridge-config.env`
3. Make sure PixoraPayments app is installed
4. Contact support with the log file

---

## 📄 File Structure

```
C:\PixoraBridge\
├── PixoraBridge.exe          (Main executable)
├── bridge-config.env          (Your configuration)
└── bridge-debug.log           (Auto-generated logs)
```

---

## ✅ Success Indicators

Bridge is working correctly when you see:

1. Console shows: "Bridge server running on port 4000"
2. When customer starts photobooth:
   - Payment app launches automatically
   - Customer completes payment
   - Photobooth starts automatically
3. Log file shows successful payment events

---

**That's it! The bridge should now be running and managing payments automatically.** 🎉
