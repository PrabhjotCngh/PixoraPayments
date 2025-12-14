const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');

const DSLR_TITLE = process.env.PHOTOBOOTH_WINDOW_TITLE || 'DSLRBOOTH - CHOOSE AN EFFECT';
const PIXORA_TITLE = process.env.PIXORA_WINDOW_TITLE || 'Pixora Payments';
const PIXORA_EXE = process.env.PIXORA_EXE || 'C:\\Users\\sw\\AppData\\Local\\Programs\\PixoraPayments\\PixoraPayments.exe';

// diagnostic (add near top)
console.log('process.env.PIXORA_EXE raw value:', process.env.PIXORA_EXE);
console.log('process.env.PIXORA_EXE (JSON):', JSON.stringify(process.env.PIXORA_EXE));
console.log('process.env.PHOTOBOOTH_WINDOW_TITLE:', process.env.PHOTOBOOTH_WINDOW_TITLE);
try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} Bridge start, PIXORA_EXE=${process.env.PIXORA_EXE} PHOTOBOOTH_WINDOW_TITLE=${process.env.PHOTOBOOTH_WINDOW_TITLE}\n`) } catch (e) {}

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
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
'@;
Add-Type -TypeDefinition $sig;
$h=[WinAPI]::FindWindow($null,'${DSLR_TITLE}');
  if ($h -ne [IntPtr]::Zero) {
  # Try minimize first
  [WinAPI]::ShowWindow($h,6) | Out-Null; # 6 = Minimize
  Write-Output 'MINIMIZED'
  Start-Sleep -Milliseconds 200
  # Try moving it to the bottom of the z-order
  $HWND_BOTTOM = [IntPtr]1;
  $SWP_NOSIZE = 0x0001;
  $SWP_NOMOVE = 0x0002;
  $SWP_NOACTIVATE = 0x0010;
  $flags = $SWP_NOSIZE -bor $SWP_NOMOVE -bor $SWP_NOACTIVATE;
  [WinAPI]::SetWindowPos($h, $HWND_BOTTOM, 0,0,0,0, $flags) | Out-Null;
  Write-Output 'SET_Z_ORDER_BOTTOM'
  # As a fallback, hide the window if it still appears on top
  Start-Sleep -Milliseconds 200
  [WinAPI]::ShowWindow($h,0) | Out-Null; # 0 = Hide
  Write-Output 'HIDDEN'
}
else {
  Write-Output 'WINDOW_NOT_FOUND'
}
    `
  ], { windowsHide: true });
  ps.on('error', (e) => console.error('Minimize PS error:', e));
  ps.stdout && ps.stdout.on('data', (d) => { console.log('Minimize PS stdout:', d.toString()); try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} Minimize PS stdout: ${d.toString()}\n`) } catch(e){} });
  ps.stderr && ps.stderr.on('data', (d) => { console.warn('Minimize PS stderr:', d.toString()); try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} Minimize PS stderr: ${d.toString()}\n`) } catch(e){} });
  ps.on('exit', (code) => { console.log('Minimize PS exit code:', code); try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} Minimize PS exit code: ${code}\n`) }catch(e){} });
}

const { execFile } = require('child_process');

function launchPixora() {
  try {
    // macOS path: use `open -a` with args to bring to front
    if (process.platform === 'darwin') {
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} macOS launch via open -a PixoraPayments --args --bring-to-front\n`) } catch(e){}
      const child = spawn('open', ['-a', 'PixoraPayments', '--args', '--bring-to-front'], { stdio: 'ignore' });
      child.on('error', (err) => { console.warn('open -a error:', err); try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} open -a error: ${err}\n`) }catch(e){} });
      // Try to bring Electron window to front shortly after launch
      setTimeout(() => focusPixoraWindow(), 600);
      return;
    }

    if (!fs.existsSync(exePath)) {
      console.error('PixoraPayments executable not found at:', exePath);
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} Pixora exe not found at: ${exePath}\n`) }catch(e){}
      return;
    }

    // 1) Try execFile (direct, shows GUI normally)
    try {
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} launchPixora execFile attempt: ${exePath}\n`) }catch(e){}
      const child = execFile(exePath, ['--bring-to-front'], { windowsHide: false }, (err) => {
        if (err) { console.warn('execFile error:', err); try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} execFile error: ${err}\n`) }catch(e){} }
      });
      child && console.log('Launched (execFile) at:', exePath, 'pid:', child.pid);
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} Launched (execFile) at: ${exePath} pid:${child && child.pid}\n`) }catch(e){}
      // Give the app a moment to register a window and then attempt to focus it
      setTimeout(() => focusPixoraWindow(), 700);
      return;
    } catch (e) {
      console.warn('execFile throw, falling back:', e);
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} execFile threw: ${e}\n`) }catch(e){}
    }

    // 2) Try spawn with shell (uses cmd / powershell to start)
    try {
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} launchPixora spawn(shell) attempt: ${exePath}\n`) }catch(e){}
      const child = spawn(exePath, ['--bring-to-front'], { shell: true, detached: false, stdio: 'inherit', windowsHide: false });
      child.on('error', (err) => { console.warn('spawn(shell) error:', err); try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} spawn(shell) error: ${err}\n`) }catch(e){} });
      child.on('exit', (code, sig) => { console.log('spawn(shell) exit', code, sig); try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} spawn(shell) exit ${code} sig:${sig}\n`) }catch(e){} });
      console.log('Launched (spawn shell) at:', exePath, 'pid:', child.pid);
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} Launched (spawn shell) at: ${exePath} pid:${child.pid}\n`) }catch(e){}
      // Try to bring Pixora to front after brief delay
      setTimeout(() => focusPixoraWindow(), 700);
      return;
    } catch (e) {
      console.warn('spawn(shell) throw, falling back:', e);
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} spawn(shell) threw: ${e}\n`) }catch(e){}
    }

    // 3) Fallback: PowerShell Start-Process (matches manual Start-Process)
    try {
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} launchPixora PowerShell Start-Process attempt for: ${exePath}\n`) }catch(e){}
      const ps = spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Process', '-FilePath', `"${exePath}"`, '-ArgumentList', "'--bring-to-front'"], { windowsHide: false });
      ps.on('error', (err) => { console.warn('PowerShell Start-Process error:', err); try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} PowerShell Start-Process error: ${err}\n`) }catch(e){} });
      ps.on('exit', (code) => { console.log('PowerShell Start-Process exit', code); try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} PowerShell Start-Process exit: ${code}\n`) }catch(e){} });
      console.log('Tried Start-Process for:', exePath);
      setTimeout(() => focusPixoraWindow(), 700);
      return;
    } catch (e) {
      console.warn('PowerShell fallback throw:', e);
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} PowerShell fallback threw: ${e}\n`) }catch(e){}
    }
  } catch (e) {
    console.error('Failed to launch PixoraPayments:', e);
  }
}

function focusPixoraWindow(maxRetries = 6, tryDelayMs = 350) {
  // Only Windows handling; app targets Windows environments.
  if (process.platform !== 'win32') {
    return;
  }

  let attempts = 0;
  const psScript = `
Add-Type -Namespace User32 -Name Api -MemberDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinApi {
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
'@;
$h = [User32.Api]::FindWindow($null, '${PIXORA_TITLE}');
if ($h -ne [IntPtr]::Zero) {
  # Simulate an ALT keystroke to relax foreground lock
  [User32.Api]::keybd_event(0x12,0,0,[UIntPtr]::Zero) # ALT down
  [User32.Api]::keybd_event(0x12,0,2,[UIntPtr]::Zero) # ALT up

  # Restore window if minimized and bring to front
  [User32.Api]::ShowWindowAsync($h, 9) | Out-Null # SW_RESTORE
  [User32.Api]::SetForegroundWindow($h) | Out-Null

  # Toggle TOPMOST to force z-order change
  $HWND_TOPMOST = [IntPtr] -1
  $HWND_NOTOPMOST = [IntPtr] -2
  $SWP_NOSIZE = 0x0001
  $SWP_NOMOVE = 0x0002
  $SWP_NOACTIVATE = 0x0010
  $flags = $SWP_NOSIZE -bor $SWP_NOMOVE -bor $SWP_NOACTIVATE
  [User32.Api]::SetWindowPos($h, $HWND_TOPMOST, 0,0,0,0, $flags) | Out-Null
  Start-Sleep -Milliseconds 120
  [User32.Api]::SetWindowPos($h, $HWND_NOTOPMOST, 0,0,0,0, $flags) | Out-Null
  Write-Output 'FOCUSED'
} else {
  Write-Output 'PIXORA_WINDOW_NOT_FOUND'
}
`;
  const runOnce = () => {
    attempts += 1;
    const tmpName = `pixora_focus_${Date.now()}_${Math.floor(Math.random()*1000)}.ps1`;
    const tmpPath = path.join(require('os').tmpdir(), tmpName);
    try { fs.writeFileSync(tmpPath, psScript, 'utf8'); } catch (e) { try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} Failed to write focus PS file: ${e}\n`) } catch(e){} }
    try {
      const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPath], { windowsHide: true });
      let out = '';
      ps.stdout && ps.stdout.on('data', (d) => { out += d.toString(); });
      ps.on('exit', (code) => {
        try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} focus script exit: ${code} stdout:${out}\n`)}catch(e){}
        try { fs.unlinkSync(tmpPath); } catch(e){}
        if (out && out.indexOf('FOCUSED') !== -1) {
          try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} focus succeeded on attempt ${attempts}\n`); } catch(e){}
        } else {
          if (attempts < maxRetries) {
            setTimeout(runOnce, tryDelayMs);
          } else {
            try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} focus failed after ${attempts} attempts\n`); } catch(e){}
          }
        }
      });
    } catch (e) {
      try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} focus spawn error: ${e}\n`) } catch(e){}
      if (attempts < maxRetries) setTimeout(runOnce, tryDelayMs);
    }
  };
  runOnce();
}

// Orchestrate: minimize DSLR, launch Pixora, run focus retries with tuned timings
function orchestrateLaunch(options = {}) {
  const cfg = Object.assign({
    preMinimizeDelayMs: 150,
    postLaunchDelayMs: 600,
    focusRetries: 8,
    focusRetryDelayMs: 250
  }, options);

  try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} orchestrateLaunch start: ${JSON.stringify(cfg)}\n`) } catch(e){}

  // Step 1: minimize DSLR
  minimizeDSLRBooth();
  // Step 2: small delay to let minimize apply
  setTimeout(() => {
    // Step 3: launch Pixora
    launchPixora();
    // Step 4: after Pixora window exists, attempt focus retries
    setTimeout(() => {
      let attempts = 0;
      const tick = () => {
        attempts += 1;
        try { fs.appendFileSync('bridge-debug.log', `${new Date().toISOString()} orchestrate focus attempt ${attempts}/${cfg.focusRetries}\n`) } catch(e){}
        focusPixoraWindow(1, 0); // single attempt per tick
        if (attempts < cfg.focusRetries) {
          setTimeout(tick, cfg.focusRetryDelayMs);
        }
      };
      tick();
    }, cfg.postLaunchDelayMs);
  }, cfg.preMinimizeDelayMs);
}

app.get('/', (req, res) => {
  const { event_type, param1, param2 } = req.query || {};
  const time = new Date().toISOString();
  console.log(time, 'Trigger:', { event_type, param1, param2 });
  try { fs.appendFileSync('bridge-debug.log', `${time} Trigger: ${JSON.stringify({ event_type, param1, param2 })}\n`) } catch(e) {}

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

// Single endpoint to run: minimize DSLR + launch Pixora + focus retries
app.get('/start', (req, res) => {
  const time = new Date().toISOString();
  try { fs.appendFileSync('bridge-debug.log', `${time} /start called query=${JSON.stringify(req.query)}\n`) } catch(e){}
  const now = Date.now();
  if (now - lastLaunchAt > 1500) {
    lastLaunchAt = now;
    const options = {
      preMinimizeDelayMs: Number(req.query.preMinimizeDelayMs || 150),
      postLaunchDelayMs: Number(req.query.postLaunchDelayMs || 600),
      focusRetries: Number(req.query.focusRetries || 8),
      focusRetryDelayMs: Number(req.query.focusRetryDelayMs || 250)
    };
    orchestrateLaunch(options);
    res.send('STARTED');
  } else {
    res.send('DEBOUNCED');
  }
});

app.listen(4000, () => {
  console.log('PixoraBridge listening on http://127.0.0.1:4000');
});