const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

// Allow autoplay with sound without user gesture (Chromium policy)
try { app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); } catch (e) {}

let mainWindow;
let serverProcess;
const appConfig = require('./config.json');
const winCfg = (appConfig && appConfig.window) ? appConfig.window : {};
// Honor CLI flags like --bring-to-front (useful when launched by bridge)
const cliBringToFront = process.argv && process.argv.includes('--bring-to-front');
if (cliBringToFront) winCfg.bringToFrontOnLaunch = true;

// Allow environment variables to override config for quick debugging/launch scenarios
const envBool = (v) => (typeof v === 'string') ? (v.toLowerCase() === '1' || v.toLowerCase() === 'true') : undefined;
if (typeof envBool(process.env.PIXORA_KIOSK) !== 'undefined') winCfg.kiosk = envBool(process.env.PIXORA_KIOSK);
if (typeof envBool(process.env.PIXORA_ALWAYS_ON_TOP) !== 'undefined') winCfg.alwaysOnTop = envBool(process.env.PIXORA_ALWAYS_ON_TOP);
if (typeof envBool(process.env.PIXORA_SKIPTASKBAR) !== 'undefined') winCfg.skipTaskbar = envBool(process.env.PIXORA_SKIPTASKBAR);

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    // Production window settings (configurable in config.json)
    width: winCfg.width || 1200,
    height: winCfg.height || 800,
    fullscreen: !!winCfg.fullscreen,
    kiosk: !!winCfg.kiosk,
    frame: !!winCfg.frame,
    alwaysOnTop: !!winCfg.alwaysOnTop,
    resizable: !!winCfg.resizable,
    autoHideMenuBar: !!winCfg.autoHideMenuBar,
    skipTaskbar: !!winCfg.skipTaskbar,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', 'icon.ico')
  });

  // Load index/welcome screen first
  mainWindow.loadFile('src/payment.html');

  // Production: hide menu bar and do not open DevTools
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.openDevTools();

  // Respect configured window behavior and show the window
  mainWindow.once('ready-to-show', () => {
    try {
      if (winCfg.alwaysOnTop) {
        try { mainWindow.setAlwaysOnTop(true, 'screen-saver'); } catch (e) { mainWindow.setAlwaysOnTop(true); }
      }
      if (winCfg.kiosk) {
        mainWindow.setKiosk(true);
      }
      // Attempt to bring the window to the front on launch
      const bringToFront = typeof winCfg.bringToFrontOnLaunch === 'boolean' ? winCfg.bringToFrontOnLaunch : true;
      if (bringToFront) {
        try {
          // Show and focus
          mainWindow.show();
          mainWindow.focus();
          // Temporary always-on-top trick to force foreground activation on Windows
          try { mainWindow.setAlwaysOnTop(true, 'screen-saver'); } catch (e) { try { mainWindow.setAlwaysOnTop(true); } catch (e) {} }
          setTimeout(() => {
            try { mainWindow.setAlwaysOnTop(!!winCfg.alwaysOnTop); } catch (e) {}
          }, 500);
        } catch (e) {
          // best-effort - log and continue
          console.warn('bringToFront failed:', e);
          try { fs.appendFileSync('debug.log', `${new Date().toISOString()} bringToFront error: ${e}\n`); } catch (ee) {}
        }
      }
      mainWindow.show();
      mainWindow.focus();
    } catch (e) {
      console.warn('Failed to apply configured window behavior or focus:', e);
    }
  });

  // Trim verbose window lifecycle logging
}

// Start Express server for webhooks
function startWebhookServer() {
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start webhook server:', err);
    try { fs.appendFileSync('debug.log', `${new Date().toISOString()} Failed to start webhook server: ${err}\n`); } catch (e) {}
  });

  try { fs.appendFileSync('debug.log', `${new Date().toISOString()} Webhook server spawned (pid=${serverProcess.pid})\n`); } catch (e) {}
}

// Get configuration
ipcMain.handle('get-config', async () => {
  const config = require('./config.json');
  return config;
});

// Get backend base URL: local if USE_LOCAL_BACKEND enabled, else hosted
ipcMain.handle('get-backend-base', async () => {
  const config = require('./config.json');
  const useLocal = (process.env.USE_LOCAL_BACKEND || '').trim().toLowerCase();
  if (useLocal === 'true' || useLocal === '1') {
    return 'http://127.0.0.1:3000';
  }
  return (config && config.bridge && config.bridge.baseUrl) ? config.bridge.baseUrl : 'https://pixora.textberry.io';
});

// Quit the Pixora app on demand
ipcMain.handle('quit-app', async () => {
  try {
    app.quit();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Get Cashfree App ID
ipcMain.handle('get-cashfree-app-id', async () => {
  return process.env.CASHFREE_APP_ID;
});

// Get Cashfree ENV (sandbox|production)
ipcMain.handle('get-cashfree-env', async () => {
  const env = (process.env.CASHFREE_ENV || '').toLowerCase();
  if (env === 'production') return 'production';
  return 'sandbox';
});

// Get Device ID for bridge routing (env or hostname)
ipcMain.handle('get-device-id', async () => {
  // Priority: .env DEVICE_ID -> stored file -> hostname
  try {
    const envId = (process.env.DEVICE_ID || '').trim();
    if (envId) return envId;
  } catch (_) {}
  try {
    const dir = app.getPath('userData');
    const file = path.join(dir, 'device-id.txt');
    if (fs.existsSync(file)) {
      const v = String(fs.readFileSync(file, 'utf8')).trim();
      if (v) return v;
    }
    const id = crypto.randomUUID();
    try { fs.writeFileSync(file, id, 'utf8'); } catch (_) {}
    return id;
  } catch (_) {
    try { return os.hostname(); } catch (_) { return 'unknown-device'; }
  }
});

// Set/Persist Device ID (editable from renderer)
ipcMain.handle('set-device-id', async (_event, newIdRaw) => {
  try {
    const newId = String(newIdRaw || '').trim();
    if (!newId) return { success: false, error: 'empty_device_id' };
    const dir = app.getPath('userData');
    const file = path.join(dir, 'device-id.txt');
    fs.writeFileSync(file, newId, 'utf8');
    return { success: true, deviceId: newId };
  } catch (e) {
    return { success: false, error: e?.message || 'write_failed' };
  }
});

// Allow programmatic bring-to-front from UI or other processes
ipcMain.handle('bring-to-front', async () => {
  if (!mainWindow) return { success: false, error: 'no window' };
  try {
    mainWindow.show();
    mainWindow.focus();
    try { mainWindow.setAlwaysOnTop(true, 'screen-saver'); } catch (e) { try { mainWindow.setAlwaysOnTop(true); } catch (e) {} }
    setTimeout(() => { try { mainWindow.setAlwaysOnTop(!!winCfg.alwaysOnTop); } catch (e) {} }, 400);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// App lifecycle
app.whenReady().then(() => {
    const useLocal = (process.env.USE_LOCAL_BACKEND || '').trim().toLowerCase();
    if (useLocal === 'true' || useLocal === '1') {
      console.log('Starting local backend (USE_LOCAL_BACKEND enabled)');
      try { fs.appendFileSync('debug.log', `${new Date().toISOString()} Starting local backend (USE_LOCAL_BACKEND)\n`); } catch (e) {}
      startWebhookServer();
    } else {
      console.log('Skipping local backend spawn (using hosted APIs)');
      try { fs.appendFileSync('debug.log', `${new Date().toISOString()} Skipping local backend spawn (hosted APIs)\n`); } catch (e) {}
    }
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});