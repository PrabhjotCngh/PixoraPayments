const express = require('express');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

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
  const event = req.query.event_type || req.query.event || '';
  console.log(new Date().toISOString(), 'bridge event:', event);
  log(`GET / event=${event} query=${JSON.stringify(req.query)}`);

  if (event === 'session_start') {
    log('session_start -> launchPixora');
    launchPixora();
  } else if (event === 'payment_complete') {
    log('payment_complete -> restoreDSLRBooth');
    restoreDSLRBooth(); 
  }
  res.send('OK');
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
    pixoraExeExists: exists
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

app.listen(4000, () => {
  console.log('PixoraBridge listening on https://pixora.textberry.io');
  log('Bridge listening on https://pixora.textberry.io');
  try { log(`Startup resolved Pixora exe: ${PIXORA_EXE} exists=${fs.existsSync(PIXORA_EXE)}`); } catch (_) {}
});