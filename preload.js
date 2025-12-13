const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Launch photobooth app
  launchPhotobooth: () => {
    console.log('preload: launchPhotobooth invoked');
    return ipcRenderer.invoke('launch-photobooth');
  },
  
  // Restore or launch photobooth (tries to restore minimized window by title if running)
  restoreOrLaunchPhotobooth: () => {
    console.log('preload: restoreOrLaunchPhotobooth invoked');
    return ipcRenderer.invoke('restore-or-launch-photobooth');
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
  ,
  exitKiosk: () => ipcRenderer.invoke('exit-kiosk')
  ,
  bringToFront: () => ipcRenderer.invoke('bring-to-front')
  
});