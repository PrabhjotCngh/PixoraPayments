const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const os = require('os');
const fs = require('fs');
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
  mainWindow.setMenuBarVisibility(true);
  mainWindow.webContents.openDevTools();
  mainWindow.webContents.on('did-finish-load', () => {
    try { fs.appendFileSync('debug.log', `${new Date().toISOString()} mainWindow did-finish-load: ${mainWindow.webContents.getURL()}\n`); } catch(e){}
    console.log('mainWindow did-finish-load', mainWindow.webContents.getURL());
  });

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

  // Log that window creation completed
  try { fs.appendFileSync('debug.log', `${new Date().toISOString()} Created main window (kiosk=${mainWindow.isKiosk()}, alwaysOnTop=${mainWindow.isAlwaysOnTop()}, bounds=${JSON.stringify(mainWindow.getBounds())})\n`); } catch (e) {}

  // Monitor window visibility/focus changes for debug
  mainWindow.on('show', () => { try { fs.appendFileSync('debug.log', `${new Date().toISOString()} mainWindow.show\n`); } catch(e){}; console.log('mainWindow show'); });
  mainWindow.on('hide', () => { try { fs.appendFileSync('debug.log', `${new Date().toISOString()} mainWindow.hide\n`); } catch(e){}; console.log('mainWindow hide'); });
  mainWindow.on('focus', () => { try { fs.appendFileSync('debug.log', `${new Date().toISOString()} mainWindow.focus\n`); } catch(e){}; console.log('mainWindow focus'); });
  mainWindow.on('blur', () => { try { fs.appendFileSync('debug.log', `${new Date().toISOString()} mainWindow.blur\n`); } catch(e){}; console.log('mainWindow blur'); });
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

// Launch DSLR Photobooth app
ipcMain.handle('launch-photobooth', async () => {
  const photoboothPath = process.env.PHOTOBOOTH_APP_PATH;
  
  // Only support launching on Windows; safely no-op elsewhere
  if (process.platform !== 'win32') {
    return { success: false, error: 'Photobooth launch is only supported on Windows' };
  }

  if (!photoboothPath) {
    return { success: false, error: 'Photobooth app path not configured' };
  }

  // Validate path exists before attempting spawn
  try {
    const fs = require('fs');
    if (!fs.existsSync(photoboothPath)) {
      return { success: false, error: `Photobooth executable not found at path: ${photoboothPath}` };
    }
  } catch (e) {
    // If FS check fails, proceed but capture diagnostic
    try { fs.appendFileSync('debug.log', `${new Date().toISOString()} FS existsSync check failed: ${e}\n`); } catch (ee) {}
  }

  try {
    // Launch the photobooth application
    try { fs.appendFileSync('debug.log', `${new Date().toISOString()} launch-photobooth spawn: ${photoboothPath}\n`); } catch (e) {}
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
    try { fs.appendFileSync('debug.log', `${new Date().toISOString()} Failed to launch photobooth app: ${error}\n`); } catch (e) {}
    return { success: false, error: error.message };
  }
});

// Get configuration
ipcMain.handle('get-config', async () => {
  const config = require('./config.json');
  return config;
});

// Allow the renderer (or bridge) to exit kiosk/alwaysOnTop at runtime
ipcMain.handle('exit-kiosk', async () => {
  if (!mainWindow) return { success: false, error: 'no window' };
  try {
    if (typeof mainWindow.setKiosk === 'function') mainWindow.setKiosk(false);
    if (typeof mainWindow.setAlwaysOnTop === 'function') mainWindow.setAlwaysOnTop(false);
    if (typeof mainWindow.setFullScreen === 'function') mainWindow.setFullScreen(false);
    if (typeof mainWindow.setSkipTaskbar === 'function') mainWindow.setSkipTaskbar(false);
    try { fs.appendFileSync('debug.log', `${new Date().toISOString()} exit-kiosk invoked; kiosk/alwaysOnTop cleared
`); } catch (e) {}
    return { success: true };
  } catch (e) {
    console.error('Failed exit-kiosk:', e);
    return { success: false, error: e.message };
  }
});

// Get Cashfree App ID
ipcMain.handle('get-cashfree-app-id', async () => {
  return process.env.CASHFREE_APP_ID;
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

// Restore minimized photobooth or launch if not running
ipcMain.handle('restore-or-launch-photobooth', async () => {
  const photoboothPath = process.env.PHOTOBOOTH_APP_PATH;
  const windowTitle = process.env.PHOTOBOOTH_WINDOW_TITLE || 'dslrbooth - Choose an effect';

  if (!photoboothPath) {
    return { success: false, error: 'Photobooth app path not configured' };
  }

  try {
    // Run a PowerShell script to attempt to find the photobooth window by title
    // If found: Restore + SetForegroundWindow; otherwise, start the exe.
    const { spawnSync } = require('child_process');
    const psScript = `
  try {
  Add-Type -Namespace User32 -Name Api -MemberDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinApi {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@;
} catch { Write-Output "ADD_TYPE_FAILED: $($_)"; exit 2 }
$h = [User32.Api]::FindWindow($null, '${windowTitle}');
if ($h -ne [IntPtr]::Zero) {
  [User32.Api]::ShowWindow($h, 9) | Out-Null; # 9 = Restore
  [User32.Api]::SetForegroundWindow($h) | Out-Null;
  Write-Output 'RESTORED';
} else {
  Start-Process -FilePath "${photoboothPath}" -WindowStyle Maximized -WorkingDirectory (Split-Path -Parent "${photoboothPath}")
  Write-Output 'LAUNCHED';
}
try { } catch { Write-Output "UNEXPECTED_ERROR: $($_)"; exit 3 }
`;

  const tmpFile = path.join(os.tmpdir(), `pixora_restore_${Date.now()}_${process.pid}.ps1`);
  try { fs.writeFileSync(tmpFile, psScript, 'utf8'); } catch (e) { try { fs.appendFileSync('debug.log', `${new Date().toISOString()} Failed to write PS temp file: ${e}\n`); } catch (ee) {} throw e; }
  try { fs.appendFileSync('debug.log', `${new Date().toISOString()} restore-or-launch using PhotoBooth Path: ${photoboothPath}; WindowTitle: ${windowTitle}; script=${tmpFile}\n`); } catch (e) {}
    let spawnRes = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile], { windowsHide: true, encoding: 'utf8' });
    // If running Windows PowerShell fails to execute the script, try pwsh (PowerShell Core)
    if ((!spawnRes || spawnRes.status !== 0) && process.platform === 'win32') {
      try {
        try { fs.appendFileSync('debug.log', `${new Date().toISOString()} powershell.exe failed, attempting pwsh fallback\n`); } catch (ee) {}
        spawnRes = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile], { windowsHide: true, encoding: 'utf8' });
      } catch (e) {
        try { fs.appendFileSync('debug.log', `${new Date().toISOString()} pwsh fallback failed: ${e}\n`); } catch (ee) {}
      }
    }
    const stdout = (spawnRes && spawnRes.stdout) ? spawnRes.stdout : '';
    const stderr = (spawnRes && spawnRes.stderr) ? spawnRes.stderr : '';
    try { fs.appendFileSync('debug.log', `${new Date().toISOString()} restore-or-launch stdout:${stdout} stderr:${stderr}\n`); } catch (e) {}
    try { fs.unlinkSync(tmpFile); } catch (e) {}

    if (stderr && stderr.length) {
      console.warn('PowerShell restore/launch stderr:', stderr);
      try { fs.appendFileSync('debug.log', `${new Date().toISOString()} restore-or-launch stderr: ${stderr}\n`); } catch (e) {}
    }

    // If the script reported compile errors, try to print the first line markers to help debug
    if (stdout && stdout.indexOf('ADD_TYPE_FAILED') !== -1) {
      try { fs.appendFileSync('debug.log', `${new Date().toISOString()} PowerShell ADD_TYPE_FAILED: ${stdout}\n`); } catch (e) {}
    }

    if (stdout.indexOf('RESTORED') !== -1 || stdout.indexOf('LAUNCHED') !== -1) {
      // If restored or launched, quit Pixora (the photobooth will be in foreground)
      setTimeout(() => {
        app.quit();
      }, 1000);
      try { fs.appendFileSync('debug.log', `${new Date().toISOString()} restore-or-launch succeeded; quitting Pixora.\n`); } catch (e) {}
      return { success: true };
    }

    try { fs.appendFileSync('debug.log', `${new Date().toISOString()} restore-or-launch unknown result stdout:${stdout} stderr:${stderr}\n`); } catch (e) {}
    return { success: false, error: 'Unknown result from PowerShell', details: { stdout, stderr } };
  } catch (error) {
    console.error('Failed to restore or launch photobooth:', error);
    try { fs.appendFileSync('debug.log', `${new Date().toISOString()} restore-or-launch failed: ${error}\n`); } catch (e) {}
    return { success: false, error: error.message };
  }
});