const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');

const DSLR_TITLE = 'DSLRBOOTH - START';
// Allow overriding path via environment: PIXORA_EXE
const PIXORA_EXE = process.env.PIXORA_EXE || 'C:\\Program Files\\PixoraPayments\\PixoraPayments.exe';

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

function launchPixora() {
  try {
    if (!fs.existsSync(PIXORA_EXE)) {
      console.error('PixoraPayments executable not found at:', PIXORA_EXE);
      console.error('Set environment variable PIXORA_EXE to the correct path.');
      return;
    }
    // Use cmd to handle paths with spaces reliably
    const cmd = 'cmd.exe';
    const args = ['/c', 'start', '""', `"${PIXORA_EXE}"`];
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    console.log('Launched PixoraPayments at:', PIXORA_EXE);
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