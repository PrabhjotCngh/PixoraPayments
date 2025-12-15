const express = require('express');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configurable via env, with sensible Windows default
const DEFAULT_PIXORA_EXE = 'C\\\Users\\sw\\AppData\\Local\\Programs\\PixoraPayments\\PixoraPayments.exe';
const PIXORA_EXE = path.normalize(String(process.env.PIXORA_EXE || DEFAULT_PIXORA_EXE).replace(/^\s*"(.*)"\s*$/, '$1').replace(/^\s*'(.*)'\s*$/, '$1').trim());

const app = express();

function quitDSLRBooth() {
  if (process.platform !== 'win32') {
    console.log('quitDSLRBooth: non-Windows platform, skipping');
    return;
  }
  // Try graceful close by main window title or process name, then force kill
  const ps = spawn('powershell.exe', [
    '-NoProfile',
    '-WindowStyle', 'Hidden',
    '-Command',
    `
try {
  $procs = Get-Process | Where-Object { $_.MainWindowTitle -like '*DSLRBOOTH*' -or $_.ProcessName -match 'dslr.*booth' }
  foreach ($p in $procs) {
    try { $null = $p.CloseMainWindow(); Start-Sleep -Milliseconds 800 } catch {}
    try { $p.Refresh() } catch {}
    if (-not $p.HasExited) {
      try { Stop-Process -Id $p.Id -Force } catch {}
    }
  }
  Write-Output 'DSLR_CLOSED'
} catch { Write-Output 'DSLR_CLOSE_ERROR' }
    `
  ], { windowsHide: true });
  ps.on('error', (e) => console.warn('quitDSLRBooth error:', e));
}

function launchPixora() {
  try {
    if (process.platform === 'darwin') {
      const child = spawn('open', ['-a', 'PixoraPayments'], { stdio: 'ignore' });
      child.on('error', (err) => console.warn('open -a error:', err));
      return;
    }
    if (!fs.existsSync(PIXORA_EXE)) {
      console.error('Pixora executable not found at:', PIXORA_EXE);
      return;
    }
    const child = execFile(PIXORA_EXE, [], { windowsHide: false }, (err) => {
      if (err) console.warn('launchPixora execFile error:', err);
    });
    console.log('Launched PixoraPayments:', PIXORA_EXE, 'pid:', child && child.pid);
  } catch (e) {
    console.error('Failed to launch PixoraPayments:', e);
  }
}

// Minimal event listener: react only to session_end
app.get('/', (req, res) => {
  const event = req.query.event_type || req.query.event || '';
  console.log(new Date().toISOString(), 'bridge event:', event);

  if (event === 'session_end') {
    quitDSLRBooth();
    setTimeout(() => launchPixora(), 700);
  }
  res.send('OK');
});

app.listen(4000, () => {
  console.log('PixoraBridge listening on http://127.0.0.1:4000');
});