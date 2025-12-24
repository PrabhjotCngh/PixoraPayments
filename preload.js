const { contextBridge, ipcRenderer } = require('electron');

// Helper: best-effort wait for backend /health to be ready (handles first-launch race)
async function ensureBackendReady(timeoutMs = 4000) {
  try {
    const base = await ipcRenderer.invoke('get-backend-base');
    const healthUrl = `${base}/health`;
    const start = Date.now();
    let delay = 150;
    const tryOnce = async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 800);
      try {
        const res = await fetch(healthUrl, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
      } catch (_) {
        clearTimeout(t);
        return false;
      }
    };
    while ((Date.now() - start) < timeoutMs) {
      if (await tryOnce()) return true;
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 600);
    }
  } catch (_) {}
  return false;
}

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Quit the Pixora app
  quitApp: () => ipcRenderer.invoke('quit-app'),

  // Notify bridge that payment is complete (single source)
  notifyPaymentComplete: async () => {
    try {
      // Read bridge base from config if present, else default to server url
      let base = 'https://pixora.textberry.io';
      try {
        const cfg = await ipcRenderer.invoke('get-config');
        if (cfg && cfg.bridge && cfg.bridge.baseUrl) {
          base = cfg.bridge.baseUrl;
        }
      } catch (_) {}
      // Include deviceId for targeted routing on the hosted bridge
      let deviceId = '';
      try { deviceId = await ipcRenderer.invoke('get-device-id'); } catch (_) {}
      const ts = Date.now();
      const url = `${base}?event_type=payment_complete${deviceId ? `&deviceId=${encodeURIComponent(deviceId)}` : ''}&ts=${ts}&event_id=pc-${deviceId || 'unknown'}-${ts}`;
      await fetch(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message };
    }
  },
  
  // Get configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // Get Cashfree App ID
  getCashfreeAppId: () => ipcRenderer.invoke('get-cashfree-app-id'),
  // Get Device ID (optional external use)
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  // Get Cashfree ENV
  getCashfreeEnv: () => ipcRenderer.invoke('get-cashfree-env'),
  // Get backend base (local vs hosted)
  getBackendBase: () => ipcRenderer.invoke('get-backend-base'),
  // Set Device ID
  setDeviceId: (newId) => ipcRenderer.invoke('set-device-id', newId),
  
  // Payment APIs
  createQRCode: async (amount, description) => {
    const base = await ipcRenderer.invoke('get-backend-base');
    // Best-effort: wait briefly for backend health on first launch
    try { await ensureBackendReady(); } catch (_) {}
    const url = `${base}/api/create-qr`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, description })
    });
    return res.json();
  },
  
  checkPayment: async (qrCodeId) => {
    const base = await ipcRenderer.invoke('get-backend-base');
    const url = `${base}/api/check-payment/${encodeURIComponent(qrCodeId)}`;
    const res = await fetch(url);
    return res.json();
  }
  
});