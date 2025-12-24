// Pixora Windows Bridge Client — HARD LOCK MODE
// Guarantees: one payment per print, no taskbar, no alternation

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
  const verbose = ['1', 'true', 'debug'].includes(String(process.env.CLIENT_VERBOSE_LOGS).toLowerCase());
  const important = /assert|error|credit|lock|unlock|payment/i.test(msg);
  if (!verbose && !important) return;
  try { fs.appendFileSync('bridge-debug.log', `${ts()} ${msg}\n`); } catch (_) {}
  console.log(msg);
}

log('Bridge client starting (HARD LOCK MODE)');

/* ===================== PIXORA EXE ===================== */
function sanitize(p) {
  return String(p || '').replace(/^\s*"|"\s*$/g, '').trim();
}
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
    try { if (fs.existsSync(norm)) return norm; } catch (_) { }
  }
  return candidates[0] || 'PixoraPayments.exe';
}
const PIXORA_EXE = resolvePixoraExe();

/* ===================== STATE ===================== */
const STATE_FILE = path.join(process.env.APPDATA || process.cwd(), 'PixoraPayments', 'state.json');
fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { hasCredit: false, lastPaidAt: 0 }; }
}
function writeState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s), 'utf8');
}

function isCreditValid(state) {
  if (!state.hasCredit) return false;
  const ttl = Number(process.env.PIXORA_CREDIT_TTL_SEC || 1800);
  return (Date.now() - state.lastPaidAt) / 1000 <= ttl;
}

/* ===================== DEVICE ID ===================== */
function getDeviceId() {
  const f = path.join(path.dirname(STATE_FILE), 'device-id.txt');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const id = crypto.randomUUID();
  fs.writeFileSync(f, id);
  return id;
}
const DEVICE_ID = getDeviceId();

/* ===================== WINDOWS HARD LOCK ===================== */
function runPS(script) {
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
}

function lockScreenForPayment() {
  log('ASSERT LOCK screen for payment');

  runPS(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern int ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

# Hide taskbar
$tb = Get-Process explorer -ErrorAction SilentlyContinue
if ($tb) { $tb | Stop-Process -Force }

# Minimize DSLRBooth
$p = Get-Process | Where-Object { $_.ProcessName -match 'dslr.*booth' } | Select -First 1
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
# Restart explorer (taskbar back)
Start-Process explorer.exe

# Restore DSLRBooth
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern int ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$p = Get-Process | Where-Object { $_.ProcessName -match 'dslr.*booth' } | Select -First 1
if ($p) {
  [Win]::ShowWindow($p.MainWindowHandle, 3)
  [Win]::SetForegroundWindow($p.MainWindowHandle)
}
`);
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

    if (state.hasCredit && !isCreditValid(state)) {
      state.hasCredit = false;
      writeState(state);
      log('ASSERT expired credit cleared');
    }

    if (ev === 'session_start') {
      log(`ASSERT session_start | hasCredit=${state.hasCredit}`);
      if (!isCreditValid(state)) {
        lockScreenForPayment();
      }
    }

    else if (ev === 'payment_complete') {
      state.hasCredit = true;
      state.lastPaidAt = Date.now();
      writeState(state);
      log('ASSERT payment_complete → credit granted');
      unlockScreenAfterPayment();
    }

    else if (ev === 'printing') {
      log(`ASSERT printing | hasCredit=${state.hasCredit}`);
      if (state.hasCredit) {
        state.hasCredit = false;
        state.lastPaidAt = 0;
        writeState(state);
        log('ASSERT credit consumed');
      }
    }
  });

  ws.on('close', () => {
    log('WS closed → reconnecting');
    setTimeout(connect, 3000);
  });

  ws.on('error', (e) => log(`WS error ${e}`));
}

connect();
