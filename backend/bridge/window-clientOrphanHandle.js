// Pixora Windows Bridge Client — HARD LOCK MODE (PRODUCTION)
// Guarantees:
// - One payment per session
// - No orphan credits
// - DSLR crash recovery
// - No desktop / taskbar exposure

const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

/* ===================== LOGGER ===================== */
function ts() {
  try { return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); }
  catch (_) { return new Date().toISOString(); }
}
function log(msg) {
  const important = /assert|error|credit|lock|unlock|payment|dslr|crash/i.test(msg);
  if (!important && process.env.CLIENT_VERBOSE_LOGS !== '1') return;
  try { fs.appendFileSync('bridge-debug.log', `${ts()} ${msg}\n`); } catch (_) {}
  console.log(msg);
}

log('Bridge client starting (HARD LOCK MODE)');

/* ===================== PIXORA EXE ===================== */
function sanitize(p) {
  return String(p || '').replace(/^\s*"|"\s*$/g, '').trim();
}
function resolvePixoraExe() {
  const c = [];
  const o = sanitize(process.env.PIXORA_EXE);
  if (o) c.push(o);
  const lp = process.env.LOCALAPPDATA;
  if (lp) c.push(path.join(lp, 'Programs', 'PixoraPayments', 'PixoraPayments.exe'));
  return c.find(p => fs.existsSync(p)) || 'PixoraPayments.exe';
}
const PIXORA_EXE = resolvePixoraExe();

/* ===================== STATE ===================== */
const STATE_FILE = path.join(process.env.APPDATA || process.cwd(), 'PixoraPayments', 'state.json');
fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });

function defaultState() {
  return {
    activeSessionId: null,
    credit: {
      available: false,
      sessionId: null,
      grantedAt: null,
      consumed: false
    },
    dslr: {
      pid: null,
      startedAt: null
    }
  };
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return defaultState(); }
}
function writeState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

/* ===================== DEVICE ID ===================== */
function getDeviceId() {
  const f = path.join(path.dirname(STATE_FILE), 'device-id.txt');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const id = crypto.randomUUID();
  fs.writeFileSync(f, id);
  return id;
}
function setDeviceId(newId) {
  fs.writeFileSync(DEVICE_ID_FILE, newId);
  DEVICE_ID = newId;
  log(`ASSERT deviceId updated → ${newId}`);
}
let DEVICE_ID = getDeviceId();

/* ===================== CREDIT SAFETY ===================== */
function resetCredit(state, reason) {
  state.credit = {
    available: false,
    sessionId: null,
    grantedAt: null,
    consumed: false
  };
  writeState(state);
  log(`ASSERT credit reset [${reason}]`);
}

function cleanupOrphanCredit(state) {
  if (
    state.credit.available &&
    !state.credit.consumed &&
    state.credit.sessionId !== state.activeSessionId
  ) {
    resetCredit(state, 'orphan_startup');
  }
}

/* ===================== WINDOWS HARD LOCK ===================== */
function runPS(script) {
  spawn('powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true }
  );
}

function lockScreenForPayment() {
  log('ASSERT LOCK screen for payment');

  runPS(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string w);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int s);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@

# Hide desktop + taskbar
$d = [Win]::FindWindow("Progman", $null)
$t = [Win]::FindWindow("Shell_TrayWnd", $null)
if ($d -ne [IntPtr]::Zero) { [Win]::ShowWindow($d, 0) }
if ($t -ne [IntPtr]::Zero) { [Win]::ShowWindow($t, 0) }

# Minimize DSLRBooth
$p = Get-Process | Where { $_.ProcessName -match 'dslr.*booth' } | Select -First 1
if ($p) { [Win]::ShowWindow($p.MainWindowHandle, 6) }

# Launch Pixora
$pix = Start-Process -FilePath "${PIXORA_EXE}" -PassThru
Start-Sleep -Milliseconds 500
if ($pix) { [Win]::SetForegroundWindow($pix.MainWindowHandle) }
`);
}

function unlockScreenAfterPayment() {
  log('ASSERT UNLOCK screen after payment');

  runPS(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string w);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int s);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@

# Restore desktop + taskbar
$d = [Win]::FindWindow("Progman", $null)
$t = [Win]::FindWindow("Shell_TrayWnd", $null)
if ($d -ne [IntPtr]::Zero) { [Win]::ShowWindow($d, 5) }
if ($t -ne [IntPtr]::Zero) { [Win]::ShowWindow($t, 5) }

# Restore DSLRBooth
$p = Get-Process | Where { $_.ProcessName -match 'dslr.*booth' } | Select -First 1
if ($p) {
  [Win]::ShowWindow($p.MainWindowHandle, 3)
  [Win]::SetForegroundWindow($p.MainWindowHandle)
}
`);
}

/* ===================== DSLR WATCHDOG ===================== */
function markDSLRStarted(pid, state) {
  state.dslr = { pid, startedAt: Date.now() };
  writeState(state);

  setTimeout(() => {
    try {
      process.kill(pid, 0);
      if (!state.credit.consumed) {
        state.credit.consumed = true;
        state.credit.available = false;
        writeState(state);
        log('ASSERT credit consumed (DSLR stable)');
      }
    } catch {
      resetCredit(state, 'dslr_start_fail');
      lockScreenForPayment();
    }
  }, 5000);
}

/* ===================== WEBSOCKET ===================== */
const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL;

function connect() {
  const ws = new WebSocket(`${BRIDGE_SERVER_URL}?deviceId=${DEVICE_ID}`);
  log('WS connecting');

  ws.on('open', () => log('WS open'));

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    const ev = msg.event_type;
    const state = readState();

    cleanupOrphanCredit(state);

    if (ev === 'session_start') {
      state.activeSessionId = `sess_${Date.now()}`;
      writeState(state);
      resetCredit(state, 'new_session');
      lockScreenForPayment();
    }

    else if (ev === 'payment_complete') {
      state.credit = {
        available: true,
        sessionId: state.activeSessionId,
        grantedAt: Date.now(),
        consumed: false
      };
      writeState(state);
      unlockScreenAfterPayment();
    }

    else if (ev === 'dslr_started' && msg.pid) {
      markDSLRStarted(msg.pid, state);
    }

    /* ===== ADMIN EVENTS ===== */

    else if (ev === 'reset_credit') {
      state.hasCredit = false;
      state.creditPendingSession = false;
      state.lastPaidAt = 0;
      state.currentSession = null;
      writeState(state);
      log('ASSERT credit reset by admin');
    }

    else if (ev === 'force_payment') {
      state.creditPendingSession = false;
      writeState(state);
      log('ASSERT force_payment by admin');
      lockScreenForPayment();
    }

    else if (ev === 'set_device_id') {
      const newId = String(msg?.payload?.newId || '').trim();
      if (newId) {
        log(`ASSERT set_device_id → ${newId}`);
        setDeviceId(newId);
        try { ws.close(4100, 'device id change'); } catch (_) {}
      }
    }
  });

  ws.on('close', () => setTimeout(connect, 3000));
  ws.on('error', e => log(`WS error ${e.message}`));
}

cleanupOrphanCredit(readState());
connect();
