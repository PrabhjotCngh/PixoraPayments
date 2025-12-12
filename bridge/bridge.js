const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');

const DSLR_TITLE = 'DSLRBOOTH - START';
const PIXORA_EXE = process.env.PIXORA_EXE || 'C:\\Users\\sw\\AppData\\Local\\Programs\\PixoraPayments\\PixoraPayments.exe';

// diagnostic (add near top)
console.log('process.env.PIXORA_EXE raw value:', process.env.PIXORA_EXE);
console.log('process.env.PIXORA_EXE (JSON):', JSON.stringify(process.env.PIXORA_EXE));

// Allow overriding path via environment: PIXORA_EXE

const path = require('path');
const defaultExe = 'C:\\Users\\sw\\AppData\\Local\\Programs\\PixoraPayments\\PixoraPayments.exe';

// raw env or default
const raw = process.env.PIXORA_EXE || defaultExe;

// strip surrounding quotes, trim, normalize to platform format
let exePath = String(raw).replace(/^\s*"(.*)"\s*$/, '$1').replace(/^\s*'(.*)'\s*$/, '$1').trim();
exePath = path.normalize(exePath);

// console + file debug (guarantees we can inspect when console is invisible)
console.log('process.env.PIXORA_EXE (JSON):', JSON.stringify(process.env.PIXORA_EXE));
console.log('raw value used:', raw);
console.log('normalized exePath:', exePath);
try {
  fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} raw:${JSON.stringify(process.env.PIXORA_EXE)} rawUsed:${raw} exePath:${exePath}\n`);
} catch (err) {}

const app = express();
let lastLaunchAt = 0;

function minimizeDSLRBooth() {
  const ps = spawn('powershell.exe', [
    '-NoProfile',
    '-WindowStyle', 'Hidden',
    '-Command',
    `
$sig=@'
using System;
using System.Runtime.InteropServices;
public class WinAPI {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@;
Add-Type -TypeDefinition $sig;
$h=[WinAPI]::FindWindow($null,'${DSLR_TITLE}');
if ($h -ne [IntPtr]::Zero) { [WinAPI]::ShowWindow($h,6) } # 6 = Minimize
    `
  ], { windowsHide: true });
  ps.on('error', (e) => console.error('Minimize PS error:', e));
}

const { execFile } = require('child_process');

function launchPixora() {
  try {
    if (!fs.existsSync(exePath)) {
      console.error('PixoraPayments executable not found at:', exePath);
      return;
    }

    // 1) Try execFile (direct, shows GUI normally)
    try {
      const child = execFile(exePath, { windowsHide: false }, (err) => {
        if (err) console.warn('execFile error:', err);
      });
      console.log('Launched (execFile) at:', exePath, 'pid:', child.pid);
      return;
    } catch (e) {
      console.warn('execFile throw, falling back:', e);
    }

    // 2) Try spawn with shell (uses cmd / powershell to start)
    try {
      const child = spawn(exePath, [], { shell: true, detached: false, stdio: 'inherit', windowsHide: false });
      child.on('error', (err) => console.warn('spawn(shell) error:', err));
      child.on('exit', (code, sig) => console.log('spawn(shell) exit', code, sig));
      console.log('Launched (spawn shell) at:', exePath, 'pid:', child.pid);
      return;
    } catch (e) {
      console.warn('spawn(shell) throw, falling back:', e);
    }

    // 3) Fallback: PowerShell Start-Process (matches manual Start-Process)
    try {
      const ps = spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Process', '-FilePath', `"${exePath}"`], { windowsHide: false });
      ps.on('error', (err) => console.warn('PowerShell Start-Process error:', err));
      ps.on('exit', (code) => console.log('PowerShell Start-Process exit', code));
      console.log('Tried Start-Process for:', exePath);
      return;
    } catch (e) {
      console.warn('PowerShell fallback throw:', e);
    }
  } catch (e) {
    console.error('Failed to launch PixoraPayments:', e);
  }
}

app.get('/', (req, res) => {
  const { event_type, param1, param2 } = req.query || {};
  const time = new Date().toISOString();
  console.log(time, 'Trigger:', { event_type, param1, param2 });

  // Only react to: session_start
  if (event_type === 'processing_start') {
    const now = Date.now();
    if (now - lastLaunchAt > 2000) {
      lastLaunchAt = now;
      minimizeDSLRBooth();
      launchPixora();
    } else {
      console.log('Debounced duplicate processing_start event.');
    }
  }

  res.send('OK');
});

app.listen(3000, () => {
  console.log('PixoraBridge listening on http://127.0.0.1:3000');
});