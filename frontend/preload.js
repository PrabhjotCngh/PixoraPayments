const { contextBridge, ipcRenderer } = require('electron');
const { randomUUID } = require('crypto');

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
  } catch (_) { }
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
      } catch (_) { }
      // Include deviceId for targeted routing on the hosted bridge
      let deviceId = '';
      try { deviceId = await ipcRenderer.invoke('get-device-id'); } catch (_) { }
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
  // Set Device ID
  setDeviceId: (newId) => ipcRenderer.invoke('set-device-id', newId),

  // Payment APIs
  createOrder: async (amount, description) => {
    // Get booth configuration
    const boothConfig = await ipcRenderer.invoke('get-booth-config');
    if (!boothConfig.apiKey || !boothConfig.serverUrl) {
      throw new Error('Booth not configured. Please configure the booth first (tap 5 times to open config)');
    }

    // Generate idempotency key (lowercase for consistency)
    const idempotencyKey = randomUUID().toLowerCase();
    console.log('[createOrder] Request:', { amount, description, idempotencyKey, serverUrl: boothConfig.serverUrl });

    const url = `${boothConfig.serverUrl}/api/create-order`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${boothConfig.apiKey}`,
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({ amount, description })
    });
    const data = await res.json();
    console.log('[createOrder] Response:', data);
    return data;
  },

  getOrder: async (orderId) => {
    // Get booth configuration for server URL
    const boothConfig = await ipcRenderer.invoke('get-booth-config');
    const base = boothConfig.serverUrl || await ipcRenderer.invoke('get-backend-base');
    const url = `${base}/api/get-order/${encodeURIComponent(orderId)}`;
    const res = await fetch(url);
    return res.json();
  },

  // Booth Configuration APIs
  getBoothConfig: () => ipcRenderer.invoke('get-booth-config'),
  saveBoothConfig: (config) => ipcRenderer.invoke('save-booth-config', config),
  clearBoothConfig: () => ipcRenderer.invoke('clear-booth-config'),
  openBoothConfig: () => ipcRenderer.invoke('open-booth-config')

});