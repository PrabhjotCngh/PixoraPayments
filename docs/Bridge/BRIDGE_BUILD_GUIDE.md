# Pixora Bridge - Build & Release Guide (Developer Guide)

## 🏗️ Building the Bridge Executable

### On Windows:
```bash
npm run build:bridge
```

This creates: `dist/PixoraBridge.exe` (standalone executable, ~50MB)

### What Gets Included:
- Node.js runtime (embedded)
- All npm dependencies (express, dotenv, etc.)
- Bridge logic (windows-clientV1.js)
- No installation required!

---

## 📦 Creating a Release Package

### Manual Method:

1. **Build the executable:**
   ```bash
   npm run build:bridge
   ```

2. **Create release folder:**
   ```bash
   mkdir bridge-release
   copy dist\PixoraBridge.exe bridge-release\
   copy backend\bridge\bridge-config.default.env bridge-release\bridge-config.env
   copy backend\bridge\StartBridge.bat bridge-release\
   copy BRIDGE_INSTALLATION.md bridge-release\README.md
   ```

3. **Zip it:**
   ```bash
   cd bridge-release
   tar -a -cf ..\PixoraBridge-Windows.zip *
   ```

4. **Upload to GitHub Releases:**
   - Go to Releases → Create new release
   - Upload `PixoraBridge-Windows.zip`
   - Include installation instructions

### Automated Method (GitHub Actions):

The workflow `.github/workflows/build-bridge.yml` automatically:
1. Builds on every tag push (e.g., `v1.2.0`)
2. Creates release package
3. Uploads to GitHub Releases

To trigger:
```bash
git tag v1.2.0
git push origin v1.2.0
```

---

## 🚀 Distribution

### For End Users:
They download **ONE ZIP file** containing:
- ✅ `PixoraBridge.exe` (50MB, includes everything)
- ✅ `bridge-config.env` (editable settings)
- ✅ `StartBridge.bat` (easy launcher)
- ✅ `README.md` (instructions)

### No Additional Requirements:
- ❌ No Node.js installation
- ❌ No npm install
- ❌ No git clone
- ❌ No build process

### Installation Steps (for users):
1. Extract ZIP to `C:\PixoraBridge`
2. Edit `bridge-config.env`
3. Run `StartBridge.bat`
4. Done! 🎉

---

## 🔧 Configuration File

Users only edit `bridge-config.env`:

```env
# Path to your photobooth software
PHOTOBOOTH_APP_PATH=C:\Program Files\dslrBooth\dslrBooth.exe

# Optional: Override Pixora app path (auto-detected)
# PIXORA_EXE=C:\Users\YourName\AppData\Local\Programs\PixoraPayments\PixoraPayments.exe

# Bridge port (default: 4000)
BRIDGE_PORT=4000

# Credit expiry (seconds)
PIXORA_CREDIT_TTL_SEC=1800

# Logging
CLIENT_VERBOSE_LOGS=true
```

---

## 📊 File Sizes

- `PixoraBridge.exe`: ~50MB (includes Node.js + dependencies)
- `bridge-config.env`: <1KB
- `StartBridge.bat`: <1KB
- **Total ZIP**: ~15MB (compressed)

---

## 🎯 Benefits

### Before (Current):
1. Download git
2. Clone repository (200MB+)
3. Install Node.js (50MB installer)
4. Run `npm install` (downloads 500MB+ node_modules)
5. Configure .env
6. Run `npm run bridge:localClient`

**Requirements:** Git, Node.js, npm knowledge

### After (With Executable):
1. Download ZIP (15MB)
2. Extract
3. Edit config file
4. Double-click `.bat` file

**Requirements:** None! Works on any Windows PC

---

## 🔄 Updates

To update the bridge:
1. Download new ZIP
2. Stop old bridge
3. Replace `.exe` file
4. Keep your `bridge-config.env` (settings preserved)
5. Start new bridge

---

## 💡 Technical Details

### How `pkg` Works:
- Bundles Node.js binary + your code
- Creates single executable
- Runs without external Node.js
- Cross-platform (Windows, Mac, Linux)

### Environment Loading:
- Checks for `bridge-config.env` next to `.exe`
- Falls back to defaults if not found
- No code changes needed by users

### Auto-Detection:
- Pixora app path auto-discovered
- Searches common install locations
- Can be overridden in config

---

## 🐛 Troubleshooting Build Issues

### Error: "pkg not found"
```bash
npm install --save-dev pkg
```

### Error: "Node version mismatch"
Update pkg target in package.json:
```json
"build:bridge": "pkg backend/bridge/windows-clientV1.js --targets node18-win-x64 --output dist/PixoraBridge.exe"
```

### Error: "Module not found" when running .exe
Add to package.json:
```json
"pkg": {
  "assets": [
    "backend/bridge/bridge-config.default.env"
  ]
}
```

---

## ✅ Testing the Executable

1. Build: `npm run build:bridge`
2. Copy `.exe` to test folder
3. Create `bridge-config.env` with test settings
4. Run `PixoraBridge.exe`
5. Verify:
   - Console shows "Bridge server running"
   - Port 4000 is listening
   - Log file created
   - Can trigger payment events

---

## 📝 Release Checklist

Before creating a release:

- [ ] Test `.exe` on clean Windows machine
- [ ] Verify config file is editable
- [ ] Check all paths are documented
- [ ] Update version number
- [ ] Test auto-detection of Pixora app
- [ ] Verify logging works
- [ ] Test with actual photobooth software
- [ ] Update BRIDGE_INSTALLATION.md
- [ ] Create GitHub release with instructions

---

**This approach makes the bridge as easy to install as the main PixoraPayments app!** 🎉
