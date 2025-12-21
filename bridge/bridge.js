const express = require('express');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Resolve PixoraPayments.exe dynamically across machines
function sanitize(p) {
  return String(p || '').replace(/^\s*"|"\s*$/g, '').replace(/^\s*'|'\s*$/g, '').trim();
}
function resolvePixoraExe() {
  const candidates = [];
  const envOverride = sanitize(process.env.PIXORA_EXE);
  if (envOverride) candidates.push(path.normalize(envOverride));

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    if (local) candidates.push(path.join(local, 'Programs', 'PixoraPayments', 'PixoraPayments.exe'));
    const userprofile = process.env.USERPROFILE;
    if (userprofile) candidates.push(path.join(userprofile, 'AppData', 'Local', 'Programs', 'PixoraPayments', 'PixoraPayments.exe'));
    const pf = process.env['ProgramFiles'];
    if (pf) candidates.push(path.join(pf, 'PixoraPayments', 'PixoraPayments.exe'));
    const pf86 = process.env['ProgramFiles(x86)'];
    if (pf86) candidates.push(path.join(pf86, 'PixoraPayments', 'PixoraPayments.exe'));
  }

  // Deduplicate and return first existing path
  const seen = new Set();
  for (const p of candidates) {
    const norm = path.normalize(p);
    if (seen.has(norm)) continue;
    seen.add(norm);
    try { if (fs.existsSync(norm)) return norm; } catch (_) {}
  }

  // Fallback: return first candidate (may not exist) or a generic name
  return candidates[0] || 'PixoraPayments.exe';
}
const PIXORA_EXE = resolvePixoraExe();
try { log(`Resolved Pixora exe: ${PIXORA_EXE} exists=${fs.existsSync(PIXORA_EXE)}`); } catch (_) {}

const app = express();
app.use(express.json());
// Optional admin token for sensitive endpoints
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
function isAuthorized(req) {
  if (!ADMIN_TOKEN) return true;
  const t = (req.query && req.query.token) || req.headers['x-admin-token'] || (req.body && req.body.token) || '';
  return t === ADMIN_TOKEN;
}

// Basic HTTP auth for /admin UI (optional)
const ADMIN_BASIC_USER = process.env.ADMIN_BASIC_USER || '';
const ADMIN_BASIC_PASS = process.env.ADMIN_BASIC_PASS || '';
function basicAuth(req, res, next) {
  if (!ADMIN_BASIC_USER || !ADMIN_BASIC_PASS) return next();
  const hdr = req.headers['authorization'] || '';
  if (!hdr.startsWith('Basic ')) {
    try { res.set('WWW-Authenticate', 'Basic realm="Pixora Admin"'); } catch (_) {}
    return res.status(401).send('Authentication required');
  }
  try {
    const b64 = hdr.slice(6);
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const u = idx >= 0 ? decoded.slice(0, idx) : decoded;
    const p = idx >= 0 ? decoded.slice(idx + 1) : '';
    if (u === ADMIN_BASIC_USER && p === ADMIN_BASIC_PASS) return next();
  } catch (_) {}
  try { res.set('WWW-Authenticate', 'Basic realm="Pixora Admin"'); } catch (_) {}
  return res.status(401).send('Unauthorized');
}
const clients = new Map(); // deviceId -> ws
// Recent event dedupe per device (id -> timestamp)
const recentEvents = new Map(); // deviceId -> Map(event_id -> ts)
// Per-device event blocks (mute) and cooldown tracking
const deviceBlocks = new Map(); // deviceId -> Map(event_type -> untilTs)
const lastPublished = new Map(); // `${deviceId}:${event_type}` -> ts
// Blacklist devices (hard block)
const deviceBlacklist = new Set();

function isBlocked(deviceId, event) {
  try {
    const byDev = deviceBlocks.get(deviceId);
    if (!byDev) return false;
    const until = byDev.get(event) || 0;
    return Date.now() < until;
  } catch (_) { return false; }
}

function setBlock(deviceId, event, durationMs) {
  const until = Date.now() + Math.max(0, Number(durationMs || 0));
  const byDev = deviceBlocks.get(deviceId) || new Map();
  byDev.set(event, until);
  deviceBlocks.set(deviceId, byDev);
}

function clearBlock(deviceId, event) {
  if (!deviceId) return;
  const byDev = deviceBlocks.get(deviceId);
  if (!byDev) return;
  if (event) { byDev.delete(event); } else { byDev.clear(); }
  deviceBlocks.set(deviceId, byDev);
}
// Simple IST timestamped logger
function ts() {
  try { return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); } catch (_) { return new Date().toISOString(); }
}
function log(message) {
  try { fs.appendFileSync('bridge-debug.log', `${ts()} ${message}\n`); } catch (_) {}
}

function launchPixora() {
  try {
    log(`launchPixora start platform=${process.platform} exe=${PIXORA_EXE}`);
    // 1. Basic checks
    if (process.platform === 'darwin') {
      const child = spawn('open', ['-a', 'PixoraPayments'], { stdio: 'ignore' });
      child.on('error', (err) => { log(`open -a error: ${err}`); });
      log('macOS open -a PixoraPayments invoked');
      return;
    }

    if (!fs.existsSync(PIXORA_EXE)) {
      console.error('Pixora executable not found at:', PIXORA_EXE);
      log(`Pixora exe not found at ${PIXORA_EXE}`);
      return;
    }

    console.log('Minimizing DSLRBooth and launching Pixora...');
    log('Minimizing DSLRBooth and launching Pixora...');

    // 2. PowerShell: Force Minimize DSLRBooth -> Launch Pixora
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

    // 3. Execute script
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      psScript
    ], { 
      windowsHide: true,
      env: { ...process.env, PIXORA_ALWAYS_ON_TOP: 'true' }
    });

    ps.stdout.on('data', (d) => console.log('PS:', d.toString().trim()));
    ps.stderr.on('data', (d) => console.error('PS Err:', d.toString().trim()));
    ps.stdout.on('data', (d) => { log(`PS stdout: ${d.toString().trim()}`); });
    ps.stderr.on('data', (d) => { log(`PS stderr: ${d.toString().trim()}`); });

  } catch (e) {
    console.error('Failed to launch PixoraPayments:', e);
    log(`launchPixora error: ${e}`);
  }
}

// Minimal event listener: react only to session_end
app.get('/', (req, res) => {
  // Prevent proxy/browser caching of event GETs
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  } catch (_) {}
  const event = req.query.event_type || req.query.event || '';
  const deviceId = req.query.deviceId || req.query.device_id || req.query.d || '';
  const providedId = req.query.event_id || req.query.id || '';
  const createdAt = Date.now();
  const eventId = providedId || `${event}:${deviceId}:${createdAt}`;
  console.log(new Date().toISOString(), 'bridge event:', event, 'deviceId:', deviceId);
  log(`GET / event=${event} deviceId=${deviceId} event_id=${eventId} query=${JSON.stringify(req.query)}`);

  if (event) {
    if (deviceBlacklist.has(deviceId)) {
      log(`blacklist drop event=${event} device=${deviceId}`);
      return res.json({ ok: true, blacklisted: true });
    }
    // Deduplicate events per device within a short TTL
    const ttlMs = 15000; // 15s
    const byDevice = recentEvents.get(deviceId) || new Map();
    const lastTs = byDevice.get(eventId) || 0;
    if (lastTs && (createdAt - lastTs) < ttlMs) {
      log(`dedupe drop event_id=${eventId} device=${deviceId}`);
    } else {
      // Check device block (mute) and cooldown for payment_complete
      if (isBlocked(deviceId, event)) {
        log(`blocked drop event=${event} device=${deviceId}`);
      } else {
        const key = `${deviceId}:${event}`;
        const now = Date.now();
        const cooldownMs = (event === 'payment_complete') ? 60000 : 0; // 60s cooldown for payment_complete
        const last = lastPublished.get(key) || 0;
        if (cooldownMs && (now - last) < cooldownMs) {
          log(`cooldown drop event=${event} device=${deviceId} ageMs=${now - last}`);
        } else {
          byDevice.set(eventId, createdAt);
          recentEvents.set(deviceId, byDevice);
          lastPublished.set(key, now);
          publishEvent(deviceId, { event_type: event, event_id: eventId, created_at: createdAt, payload: { query: req.query } });
        }
      }
    }
  }
  res.send('OK');
});

// POST-based event ingress to avoid caching and support richer payloads
app.post('/event', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
  } catch (_) {}
  const body = req.body || {};
  const event = body.event_type || body.event || '';
  const deviceId = body.deviceId || body.device_id || body.d || '';
  const providedId = body.event_id || body.id || '';
  const createdAt = Number(body.created_at || Date.now());
  const eventId = providedId || `${event}:${deviceId}:${createdAt}`;
  log(`POST /event event=${event} deviceId=${deviceId} event_id=${eventId} body=${JSON.stringify(body)}`);
  if (!event) return res.status(400).json({ ok: false, error: 'event_type required' });
  const ttlMs = 15000;
  const byDevice = recentEvents.get(deviceId) || new Map();
  const lastTs = byDevice.get(eventId) || 0;
  if (deviceBlacklist.has(deviceId)) {
    log(`blacklist drop event=${event} device=${deviceId}`);
    return res.json({ ok: true, blacklisted: true });
  }
  if (lastTs && (createdAt - lastTs) < ttlMs) {
    log(`dedupe drop event_id=${eventId} device=${deviceId}`);
    return res.json({ ok: true, deduped: true });
  }
  if (isBlocked(deviceId, event)) {
    log(`blocked drop event=${event} device=${deviceId}`);
    return res.json({ ok: true, blocked: true });
  }
  const key = `${deviceId}:${event}`;
  const now = Date.now();
  const cooldownMs = (event === 'payment_complete') ? 60000 : 0;
  const last = lastPublished.get(key) || 0;
  if (cooldownMs && (now - last) < cooldownMs) {
    log(`cooldown drop event=${event} device=${deviceId} ageMs=${now - last}`);
    return res.json({ ok: true, cooled: true });
  }
  byDevice.set(eventId, createdAt);
  recentEvents.set(deviceId, byDevice);
  lastPublished.set(key, now);
  publishEvent(deviceId, { event_type: event, event_id: eventId, created_at: createdAt, payload: body.payload || {} });
  return res.json({ ok: true });
});

// Health endpoint for quick diagnostics of resolved paths
app.get('/health', (req, res) => {
  let exists = false;
  try { exists = fs.existsSync(PIXORA_EXE); } catch (_) {}
  const payload = {
    status: 'ok',
    time: ts(),
    platform: process.platform,
    pixoraExe: PIXORA_EXE,
    pixoraExeExists: exists,
    connectedDevices: Array.from(clients.keys())
  };
  try { log(`GET /health -> ${JSON.stringify(payload)}`); } catch (_) {}
  res.json(payload);
});

function restoreDSLRBooth() {
  if (process.platform !== 'win32') return;
  
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
  
  log('restoreDSLRBooth invoking PowerShell');
  const child = spawn('powershell.exe', ['-Command', psRestore], { windowsHide: true });
  child.on('error', (err) => { log(`restoreDSLRBooth PS error: ${err}`); });
}

// Hosted publish: maintain WebSocket connections per device and route events
function publishEvent(deviceId, msg) {
  try {
    const payload = JSON.stringify(msg);
    if (deviceId && clients.has(deviceId)) {
      const ws = clients.get(deviceId);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(payload);
      log(`publish -> device=${deviceId} ${payload}`);
      return;
    }
    // broadcast if no deviceId
    for (const [id, ws] of clients.entries()) {
      try { if (ws.readyState === WebSocket.OPEN) ws.send(payload); } catch (_) {}
    }
    log(`broadcast -> ${payload}`);
  } catch (e) { log(`publish error: ${e}`); }
}

const server = app.listen(4000, () => {
  console.log('PixoraBridge HTTP listening on 4000');
  log('Bridge HTTP listening on 4000');
  try { log(`Startup resolved Pixora exe: ${PIXORA_EXE} exists=${fs.existsSync(PIXORA_EXE)}`); } catch (_) {}
});

// WebSocket server for hosted bridge
const wss = new WebSocket.Server({ server, path: '/bridge' });
wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('device_id') || url.searchParams.get('d') || '';
    const token = url.searchParams.get('token') || '';
    // TODO: validate token; for now, accept
    if (!deviceId) {
      ws.close(1008, 'deviceId required');
      return;
    }
    if (deviceBlacklist.has(deviceId)) {
      try { ws.close(4001, 'blacklisted'); } catch (_) {}
      log(`ws reject blacklisted device=${deviceId}`);
      return;
    }
    clients.set(deviceId, ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    log(`ws connect device=${deviceId} ip=${req.socket.remoteAddress}`);

    ws.on('message', (data) => {
      log(`ws message device=${deviceId} data=${data}`);
    });
    ws.on('close', () => {
      log(`ws close device=${deviceId}`);
      clients.delete(deviceId);
    });
    ws.on('error', (err) => {
      log(`ws error device=${deviceId} err=${err}`);
    });
  } catch (e) {
    log(`ws connection error: ${e}`);
  }
});

// Heartbeat: ping clients and terminate stale sockets
const HEARTBEAT_MS = 30000;
const heartbeatTimer = setInterval(() => {
  try {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch (_) {}
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) {}
    }
  } catch (e) { log(`heartbeat error: ${e}`); }
}, HEARTBEAT_MS);

// Admin endpoints: mute/unmute events for a device or disconnect a client
app.post('/admin/mute', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const deviceId = (req.body && (req.body.deviceId || req.body.device_id)) || '';
  const event = (req.body && (req.body.event_type || req.body.event)) || '';
  const durationMs = Number((req.body && req.body.duration_ms) || 600000); // default 10min
  if (!deviceId || !event) return res.status(400).json({ ok: false, error: 'deviceId and event_type required' });
  setBlock(deviceId, event, durationMs);
  log(`admin mute device=${deviceId} event=${event} durationMs=${durationMs}`);
  res.json({ ok: true });
});

app.post('/admin/unmute', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const deviceId = (req.body && (req.body.deviceId || req.body.device_id)) || '';
  const event = (req.body && (req.body.event_type || req.body.event)) || '';
  if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });
  clearBlock(deviceId, event);
  log(`admin unmute device=${deviceId} event=${event || 'ALL'}`);
  res.json({ ok: true });
});

app.post('/admin/disconnect', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const deviceId = (req.body && (req.body.deviceId || req.body.device_id)) || '';
  if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });
  const ws = clients.get(deviceId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.close(4000, 'admin disconnect'); } catch (_) {}
    clients.delete(deviceId);
    log(`admin disconnect device=${deviceId}`);
    return res.json({ ok: true, disconnected: true });
  }
  return res.json({ ok: true, disconnected: false });
});

app.post('/admin/block', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const deviceId = (req.body && (req.body.deviceId || req.body.device_id)) || '';
  if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });
  deviceBlacklist.add(deviceId);
  const ws = clients.get(deviceId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.close(4001, 'blacklisted'); } catch (_) {}
    clients.delete(deviceId);
  }
  log(`admin block device=${deviceId}`);
  res.json({ ok: true, blocked: true });
});

app.post('/admin/unblock', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const deviceId = (req.body && (req.body.deviceId || req.body.device_id)) || '';
  if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });
  deviceBlacklist.delete(deviceId);
  log(`admin unblock device=${deviceId}`);
  res.json({ ok: true, blocked: false });
});

app.get('/admin/clients', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const list = [];
  for (const [id, ws] of clients.entries()) {
    list.push({ deviceId: id, state: ws.readyState, connected: ws.readyState === WebSocket.OPEN });
  }
  res.json({ ok: true, clients: list });
});

// Admin UI (basic) for device controls
app.get('/admin', basicAuth, (req, res) => {
  try { res.sendFile(path.join(__dirname, 'admin.html')); } catch (e) { res.status(500).send('admin page unavailable'); }
});