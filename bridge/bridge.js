const express = require('express');
const { spawn } = require('child_process');

const DSLR_TITLE = 'DSLRBOOTH - START';
const PIXORA_EXE = 'C:\\Program Files\\PixoraPayments\\PixoraPayments.exe';

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
    spawn(PIXORA_EXE, [], { detached: true, stdio: 'ignore' }).unref();
    console.log('Launched PixoraPayments.');
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
      console.log('Debounced duplicate session_start(PrintAndGIF).');
    }
  }

  res.send('OK');
});

app.listen(3000, () => {
  console.log('PixoraBridge listening on http://127.0.0.1:3000');
});