const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

let mainWindow;
let serverProcess;

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    // Production window settings
    width: 1200,
    height: 800,
    fullscreen: true,
    frame: false,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', 'icon.ico')
  });

  // Load selection screen first
  mainWindow.loadFile('src/select.html');

  // Production: hide menu bar and do not open DevTools
  mainWindow.setMenuBarVisibility(false);
}

// Start Express server for webhooks
function startWebhookServer() {
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start webhook server:', err);
  });
}

// Launch DSLR Photobooth app
ipcMain.handle('launch-photobooth', async () => {
  const photoboothPath = process.env.PHOTOBOOTH_APP_PATH;
  
  if (!photoboothPath) {
    return { success: false, error: 'Photobooth app path not configured' };
  }

  try {
    // Launch the photobooth application
    spawn(photoboothPath, [], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    // Wait 2 seconds then close launcher
    setTimeout(() => {
      app.quit();
    }, 2000);

    return { success: true };
  } catch (error) {
    console.error('Failed to launch photobooth app:', error);
    return { success: false, error: error.message };
  }
});

// Get configuration
ipcMain.handle('get-config', async () => {
  const config = require('./config.json');
  return config;
});

// Get Cashfree App ID
ipcMain.handle('get-cashfree-app-id', async () => {
  return process.env.CASHFREE_APP_ID;
});

// App lifecycle
app.whenReady().then(() => {
  startWebhookServer();
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