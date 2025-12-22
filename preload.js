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
  createQRCode: (amount, description) => {
    return fetch('https://pixora.textberry.io/api/create-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, description })
    }).then(res => res.json());
  },
  
  checkPayment: (qrCodeId) => {
    return fetch(`https://pixora.textberry.io/api/check-payment/${qrCodeId}`)
      .then(res => res.json());
  }
  
});