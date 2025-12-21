const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');

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
let lastLaunchAt = 0;

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

app.get('/', (req, res) => {
  const { event_type, param1, param2 } = req.query || {};
  const time = new Date().toISOString();
  console.log(time, 'Trigger:', { event_type, param1, param2 });

  if (event_type === 'processing_start') {
    launchPixora();
  } else if (event_type === 'payment_complete') {
    restoreDSLRBooth();
  }

  res.send('OK');
});

app.listen(3000, () => {
  console.log('PixoraBridge listening on http://127.0.0.1:3000');
});