const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Quit the Pixora app
  quitApp: () => ipcRenderer.invoke('quit-app'),
  // Notify bridge that payment is complete (single source)
  notifyPaymentComplete: async () => {
    try {
      // Read bridge base from config if present, else default to localhost
      let base = 'http://127.0.0.1:4000';
      try {
        const cfg = await ipcRenderer.invoke('get-config');
        if (cfg && cfg.bridge && cfg.bridge.baseUrl) {
          base = cfg.bridge.baseUrl;
        }
      } catch (_) {}
      const url = `${base}?event_type=payment_complete`;
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
  
  // Payment APIs
  createQRCode: (amount, description) => {
    return fetch('http://localhost:3000/api/create-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, description })
    }).then(res => res.json());
  },
  
  checkPayment: (qrCodeId) => {
    return fetch(`http://localhost:3000/api/check-payment/${qrCodeId}`)
      .then(res => res.json());
  }
  
});