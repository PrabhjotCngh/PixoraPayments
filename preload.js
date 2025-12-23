const { contextBridge, ipcRenderer } = require('electron');

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
  // Set Device ID
  setDeviceId: (newId) => ipcRenderer.invoke('set-device-id', newId),
  
  // Payment APIs
  createQRCode: async (amount, description) => {
    const base = await ipcRenderer.invoke('get-backend-base');
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