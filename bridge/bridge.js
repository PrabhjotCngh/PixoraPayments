const express = require('express');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configurable via env, with sensible Windows default
const DEFAULT_PIXORA_EXE = 'C:\\\Users\\sw\\AppData\\Local\\Programs\\PixoraPayments\\PixoraPayments.exe';
const PIXORA_EXE = path.normalize(String(process.env.PIXORA_EXE || DEFAULT_PIXORA_EXE).replace(/^\s*"(.*)"\s*$/, '$1').replace(/^\s*'(.*)'\s*$/, '$1').trim());

const app = express();

function launchPixora() {
  try {
    // 1. Basic checks
    if (process.platform === 'darwin') {
      spawn('open', ['-a', 'PixoraPayments'], { stdio: 'ignore' });
      return;
    }

    if (!fs.existsSync(PIXORA_EXE)) {
      console.error('Pixora executable not found at:', PIXORA_EXE);
      return;
    }

    console.log('Minimizing DSLRBooth and launching Pixora...');

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

  } catch (e) {
    console.error('Failed to launch PixoraPayments:', e);
  }
}

// Minimal event listener: react only to session_end
app.get('/', (req, res) => {
  const event = req.query.event_type || req.query.event || '';
  console.log(new Date().toISOString(), 'bridge event:', event);

  if (event === 'session_start') {
    launchPixora();
  } else if (event === 'payment_complete') {
    restoreDSLRBooth(); 
  }
  res.send('OK');
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
  
  spawn('powershell.exe', ['-Command', psRestore], { windowsHide: true });
}

app.listen(4000, () => {
  console.log('PixoraBridge listening on http://127.0.0.1:4000');
});