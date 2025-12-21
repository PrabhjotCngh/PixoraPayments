// Windows Bridge Client: connects to hosted bridge and performs local actions
// Requires Node.js on Windows. Run via: npm run bridge:client

const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Logger with IST timestamps
function ts() {
  try { return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); } catch (_) { return new Date().toISOString(); }
}
function log(msg) {
  try { fs.appendFileSync('bridge-debug.log', `${ts()} ${msg}\n`); } catch (_) {}
  console.log(msg);
}

// Resolve Pixora exe dynamically
function sanitize(p) { return String(p || '').replace(/^\s*"|"\s*$/g, '').replace(/^\s*'|'\s*$/g, '').trim(); }
function resolvePixoraExe() {
  const candidates = [];
  const envOverride = sanitize(process.env.PIXORA_EXE);
  if (envOverride) candidates.push(path.normalize(envOverride));
  const local = process.env.LOCALAPPDATA;
  if (local) candidates.push(path.join(local, 'Programs', 'PixoraPayments', 'PixoraPayments.exe'));
  const userprofile = process.env.USERPROFILE;
  if (userprofile) candidates.push(path.join(userprofile, 'AppData', 'Local', 'Programs', 'PixoraPayments', 'PixoraPayments.exe'));
  const pf = process.env['ProgramFiles'];
  if (pf) candidates.push(path.join(pf, 'PixoraPayments', 'PixoraPayments.exe'));
  const pf86 = process.env['ProgramFiles(x86)'];
  if (pf86) candidates.push(path.join(pf86, 'PixoraPayments', 'PixoraPayments.exe'));
  const seen = new Set();
  for (const p of candidates) {
    const norm = path.normalize(p);
    if (seen.has(norm)) continue;
    seen.add(norm);
    try { if (fs.existsSync(norm)) return norm; } catch (_) {}
  }
  return candidates[0] || 'PixoraPayments.exe';
}
const PIXORA_EXE = resolvePixoraExe();
log(`client resolved Pixora exe: ${PIXORA_EXE} exists=${fs.existsSync(PIXORA_EXE)}`);

// Local actions
function launchPixora() {
  try {
    log(`client launchPixora start exe=${PIXORA_EXE}`);
    if (!fs.existsSync(PIXORA_EXE)) { log(`Pixora exe not found at ${PIXORA_EXE}`); return; }
    const psScript = `
      # Define Windows API to control windows
      $code = @"
      using System;
      using System.Runtime.InteropServices;
      public class Win32 {
          [DllImport("user32.dll")]
          public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
          [DllImport("user32.dll")]
          public static extern bool SetForegroundWindow(IntPtr hWnd);
      }
"@
      Add-Type $code

      # A. Find DSLRBooth (Matches 'dslrbooth', 'DSLRBooth', etc.)
      $proc = Get-Process | Where-Object { $_.ProcessName -match 'dslr.*booth' } | Select-Object -First 1

      if ($proc) {
          $h = $proc.MainWindowHandle
          # Command 6 = SW_MINIMIZE (Forces window to taskbar)
          [Win32]::ShowWindowAsync($h, 6)
          Write-Host "DSLRBooth Minimized"
      } else {
          Write-Host "DSLRBooth process not found"
      }

      # B. Launch Pixora
      # We assume Pixora will now be the only thing on screen
      $pixora = Start-Process -FilePath "${PIXORA_EXE}" -ArgumentList "--bring-to-front" -PassThru
      
      # Just in case, force focus to Pixora after a split second
      Start-Sleep -Milliseconds 500
      if ($pixora) {
          $hPix = $pixora.MainWindowHandle
          [Win32]::SetForegroundWindow($hPix)
      }
    `;
    const ps = spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-Command', psScript], { windowsHide: true, env: { ...process.env, PIXORA_ALWAYS_ON_TOP: 'true' } });
    ps.stdout.on('data', (d) => log(`PS: ${d.toString().trim()}`));
    ps.stderr.on('data', (d) => log(`PS Err: ${d.toString().trim()}`));
  } catch (e) { log(`client launchPixora error: ${e}`); }
}
function restoreDSLRBooth() {
  try {
    const psRestore = `
    $code = @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
        [DllImport("user32.dll")]
        public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);
    }
"@
    Add-Type $code
    $proc = Get-Process | Where-Object { $_.ProcessName -match 'dslr.*booth' } | Select-Object -First 1
    if ($proc) {
        $h = $proc.MainWindowHandle
        # Command 3 = SW_MAXIMIZE (Restores full screen)
        [Win32]::ShowWindowAsync($h, 3) 
        [Win32]::SetForegroundWindow($h)
    }
  `;
    const child = spawn('powershell.exe', ['-Command', psRestore], { windowsHide: true });
    child.on('error', (err) => { log(`restoreDSLRBooth PS error: ${err}`); });
  } catch (e) { log(`restoreDSLRBooth error: ${e}`); }
}

// Client connect/reconnect
const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL || 'wss://pixora.textberry.io/bridge';
const DEVICE_TOKEN = process.env.DEVICE_TOKEN || '';

function getOrCreateDeviceId() {
  try {
    const envId = (process.env.DEVICE_ID || '').trim();
    if (envId) return envId;
  } catch (_) {}
  // Use %APPDATA%\PixoraPayments\device-id.txt (fallback to %LOCALAPPDATA%)
  try {
    const base = process.env.APPDATA || process.env.LOCALAPPDATA || process.cwd();
    const dir = path.join(base, 'PixoraPayments');
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    const file = path.join(dir, 'device-id.txt');
    if (fs.existsSync(file)) {
      const v = String(fs.readFileSync(file, 'utf8')).trim();
      if (v) return v;
    }
    const id = crypto.randomUUID();
    try { fs.writeFileSync(file, id, 'utf8'); } catch (_) {}
    return id;
  } catch (_) {
    try { return require('os').hostname(); } catch (_) { return 'unknown-device'; }
  }
}
const DEVICE_ID = getOrCreateDeviceId();

function connect() {
  const url = `${BRIDGE_SERVER_URL}?deviceId=${encodeURIComponent(DEVICE_ID)}${DEVICE_TOKEN ? `&token=${encodeURIComponent(DEVICE_TOKEN)}` : ''}`;
  log(`client connecting to ${url}`);
  const ws = new WebSocket(url);
  ws.on('open', () => log('client ws open'));
  // Client heartbeat: send ping periodically to keep proxies happy
  const hb = setInterval(() => {
    try { if (ws.readyState === WebSocket.OPEN) ws.ping(); } catch (_) {}
  }, 30000);
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      log(`client recv: ${data.toString()}`);
      // Drop stale or duplicate events using event_id + created_at
      if (!global.__seenEvents) global.__seenEvents = new Map(); // id -> ts
      const now = Date.now();
      const evId = msg.event_id || '';
      const created = Number(msg.created_at || 0) || now;
      const ttlMs = 15000;
      if (evId) {
        const last = global.__seenEvents.get(evId) || 0;
        if (last && (now - last) < ttlMs) {
          log(`client drop duplicate event_id=${evId}`);
          return;
        }
        global.__seenEvents.set(evId, now);
      }
      if ((now - created) > ttlMs) {
        log(`client drop stale event ageMs=${now - created}`);
        return;
      }
      const ev = (msg && (msg.event_type || msg.event)) || '';
      if (ev === 'session_start') launchPixora();
      else if (ev === 'payment_complete') restoreDSLRBooth();
    } catch (e) {
      log(`client msg parse error: ${e}`);
    }
  });
  ws.on('close', () => { log('client ws close; reconnecting in 3s'); try { clearInterval(hb); } catch (_) {}; setTimeout(connect, 3000); });
  ws.on('error', (err) => log(`client ws error: ${err}`));
}

connect();
