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

// Persistent state for payment credit and session tracking
function getStateFilePath() {
  try {
    const base = process.env.APPDATA || process.env.LOCALAPPDATA || process.cwd();
    const dir = path.join(base, 'PixoraPayments');
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    return path.join(dir, 'state.json');
  } catch (_) {
    return path.join(process.cwd(), 'state.json');
  }
}
const STATE_FILE = getStateFilePath();
function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = String(fs.readFileSync(STATE_FILE, 'utf8'));
      return JSON.parse(raw);
    }
  } catch (_) {}
  return { hasCredit: false, lastPaidAt: 0, creditPendingSession: false, currentSession: null };
}
function writeState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8'); } catch (e) { log(`state write error: ${e}`); }
}
function getCreditTTL() {
  const def = 1800; // 30 minutes
  const envTtl = Number(process.env.PIXORA_CREDIT_TTL_SEC || '');
  return Number.isFinite(envTtl) && envTtl > 0 ? envTtl : def;
}
function isCreditValid(state) {
  try {
    if (!state || !state.hasCredit) return false;
    const ttl = getCreditTTL();
    const age = (Date.now() - (Number(state.lastPaidAt) || 0)) / 1000;
    return age >= 0 && age <= ttl;
  } catch (_) { return false; }
}
function startNewSession(state) {
  state.currentSession = { startedAt: Date.now(), progressed: false, fsm: 'started', lastEvent: 'session_start', invalidSequence: false };
}
// Event-driven session FSM to validate ordering and mark real progress
const eventToState = {
  session_start: 'started',
  countdown_start: 'countdown',
  countdown: 'countdown',
  capture_start: 'capturing',
  file_download: 'downloading',
  processing_start: 'processing',
  sharing_screen: 'sharing',
  printing: 'printing',
  file_upload: 'uploading',
  session_end: 'ended'
};
const allowedTransitions = {
  started: new Set(['countdown_start','capture_start','session_end']),
  countdown: new Set(['countdown','capture_start','session_end']),
  capturing: new Set(['file_download','processing_start','session_end']),
  downloading: new Set(['file_download','processing_start','sharing_screen','printing','file_upload','session_end']),
  processing: new Set(['sharing_screen','printing','file_upload','session_end']),
  sharing: new Set(['printing','file_upload','session_end']),
  printing: new Set(['session_end']),
  uploading: new Set(['session_end']),
  ended: new Set([])
};
function advanceSessionFsm(state, ev) {
  if (!state.currentSession) {
    state.currentSession = { startedAt: Date.now(), progressed: false, fsm: 'started', lastEvent: 'session_start', invalidSequence: true };
  }
  const sess = state.currentSession;
  const cur = sess.fsm || 'started';
  const allowed = allowedTransitions[cur] || new Set();
  if (!allowed.has(ev)) {
    // Out-of-order; flag invalid but do not advance
    sess.invalidSequence = true;
    state.currentSession = sess;
    return false;
  }
  const next = eventToState[ev] || cur;
  sess.fsm = next;
  sess.lastEvent = ev;
  // Milestones that indicate real progress: entering capturing or processing from valid prior states
  if ((ev === 'capture_start' && (cur === 'countdown' || cur === 'started')) ||
      (ev === 'processing_start' && (cur === 'capturing' || cur === 'downloading'))) {
    sess.progressed = true;
  }
  state.currentSession = sess;
  return true;
}
function endSession(state) {
  state.currentSession = null;
  state.creditPendingSession = false;
}

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
      const state = readState();
      // Expire credit if TTL exceeded
      if (state.hasCredit && !isCreditValid(state)) { state.hasCredit = false; writeState(state); }

      if (ev === 'session_start') {
        startNewSession(state);
        if (isCreditValid(state)) {
          // Skip payment app launch due to existing credit from last payment
          state.creditPendingSession = true;
          writeState(state);
          log('client: skipping Pixora launch due to existing valid credit');
        } else {
          launchPixora();
        }
      } else if (ev === 'countdown_start' || ev === 'countdown' || ev === 'capture_start' || ev === 'processing_start' || ev === 'file_download' || ev === 'sharing_screen' || ev === 'printing' || ev === 'file_upload') {
        // Advance FSM on allowed transition; only consume credit when milestones reached via valid order
        const ok = advanceSessionFsm(state, ev);
        if (!ok) {
          writeState(state);
        } else {
          if (state.creditPendingSession && state.hasCredit && state.currentSession && state.currentSession.progressed) {
            state.hasCredit = false;
            state.creditPendingSession = false;
            writeState(state);
            log('client: consumed paid credit on valid sequence milestone');
          } else {
            writeState(state);
          }
        }
      } else if (ev === 'session_end') {
        // If the session ended without progress and we had a pending credit, keep it for the next start
        if (state.creditPendingSession && state.hasCredit && !(state.currentSession && state.currentSession.progressed)) {
          log('client: session ended early; preserving paid credit for next start');
          // leave hasCredit=true, clear pending flag but keep credit
          state.creditPendingSession = false;
        }
        endSession(state);
        writeState(state);
      } else if (ev === 'payment_complete') {
        // Payment successful → grant credit and restore DSLRBooth
        state.hasCredit = true;
        state.lastPaidAt = Date.now();
        writeState(state);
        restoreDSLRBooth();
      } else if (ev === 'reset_credit') {
        // Admin-triggered credit reset
        state.hasCredit = false;
        state.creditPendingSession = false;
        state.lastPaidAt = 0;
        state.currentSession = null;
        writeState(state);
        log('client: credit reset by admin');
      } else if (ev === 'force_payment') {
        // Admin-triggered immediate payment launch (ignores credit)
        state.creditPendingSession = false;
        writeState(state);
        launchPixora();
      }
    } catch (e) {
      log(`client msg parse error: ${e}`);
    }
  });
  ws.on('close', () => { log('client ws close; reconnecting in 3s'); try { clearInterval(hb); } catch (_) {}; setTimeout(connect, 3000); });
  ws.on('error', (err) => log(`client ws error: ${err}`));
}

connect();
