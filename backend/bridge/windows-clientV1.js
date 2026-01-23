// Windows Bridge Client: listens to local server events and performs local actions
const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load .env from executable directory if running as standalone, otherwise use project root
const envPath = process.pkg
  ? path.join(path.dirname(process.execPath), 'bridge-config.env')
  : path.join(__dirname, '../../.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else if (process.pkg) {
  // If running as standalone and no config found, use defaults
  console.log('[BRIDGE] No bridge-config.env found, using defaults');
} else {
  require('dotenv').config();
}

/* ===================== LOGGER ===================== */
function ts() {
  try { return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); }
  catch (_) { return new Date().toISOString(); }
}
function log(msg) {
  const verbose = ['1', 'true', 'debug'].includes(String(process.env.CLIENT_VERBOSE_LOGS).toLowerCase());
  const important = /assert|error|credit|lock|unlock|payment/i.test(msg);
  if (!verbose && !important) return;
  try { fs.appendFileSync('bridge-debug.log', `${ts()} ${msg}\n`); } catch (_) { }
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
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

# Hide taskbar safely
$tb = [Win]::FindWindow("Shell_TrayWnd", $null)
if ($tb -ne [IntPtr]::Zero) { [Win]::ShowWindow($tb, 0) }

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
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

# Restore taskbar
$tb = [Win]::FindWindow("Shell_TrayWnd", $null)
if ($tb -ne [IntPtr]::Zero) { [Win]::ShowWindow($tb, 5) }

# Restore DSLRBooth
$p = Get-Process | Where-Object { $_.ProcessName -match 'dslr.*booth' } | Select -First 1
if ($p) {
  [Win]::ShowWindow($p.MainWindowHandle, 3)
  [Win]::SetForegroundWindow($p.MainWindowHandle)
}
`);
}

/* ===================== Poll Events ===================== */
const LOCAL_SERVER_URL = 'http://127.0.0.1:4000'; // Endpoint to poll for events
const app = express();

app.get('/', (req, res) => {
  const event = req.query.event_type || req.query.event || '';
  console.log(new Date().toISOString(), 'bridge event:', event);
  log(`GET / event=${event} query=${JSON.stringify(req.query)}`);

  handleEvent(event);
  res.send('OK');
});

function handleEvent(type) {
  const state = readState();

  if (state.hasCredit && !isCreditValid(state)) {
    state.hasCredit = false;
    writeState(state);
    log('ASSERT expired credit cleared');
  }

  if (type === 'session_start') {
    log(`ASSERT session_start | hasCredit=${state.hasCredit}`);
    if (!isCreditValid(state)) {
      lockScreenForPayment();
    }
  } else if (type === 'payment_complete') {
    state.hasCredit = true;
    state.lastPaidAt = Date.now();
    writeState(state);
    log('ASSERT payment_complete → credit granted');
    unlockScreenAfterPayment();
  } else if (type === 'printing') {
    log(`ASSERT printing | hasCredit=${state.hasCredit}`);
    if (state.hasCredit) {
      state.hasCredit = false;
      state.lastPaidAt = 0;
      writeState(state);
      log('ASSERT credit consumed');
    }
  }
}

app.listen(4000, () => {
  console.log('PixoraBridge listening on http://127.0.0.1:4000');
  log('Bridge listening on http://127.0.0.1:4000');
  try { log(`Startup resolved Pixora exe: ${PIXORA_EXE} exists=${fs.existsSync(PIXORA_EXE)}`); } catch (_) { }
  const state = readState();
  log(`has credits before event=${state.hasCredit}`);
});