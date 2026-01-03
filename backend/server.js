const express = require('express');
const axios = require('axios');
require('dotenv').config();
const appConfig = require('../frontend/config.json');
const { pixoraDir } = require('./pixoraPaths');

const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());
// Disable automatic ETag generation to avoid 304 responses on dynamic endpoints
try { app.set('etag', false); } catch (_) { }

// Serve static files from src directory
app.use(express.static(path.join(__dirname, '../frontend/src')));
console.log('Serving static from:', path.join(__dirname, '../frontend/src'));

// Also serve bridge directory at /bridge for convenience
try {
  const bridgeDir = path.join(__dirname, './bridge');
  if (fs.existsSync(bridgeDir)) {
    app.use('/bridge', express.static(bridgeDir));
  }
} catch (_) { }

// Basic auth middleware for /admin routes
const ADMIN_USER = process.env.ADMIN_BASIC_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_BASIC_PASS || 'password';

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Authentication required.');
  }
  const b64 = auth.split(' ')[1];
  const [user, pass] = Buffer.from(b64, 'base64').toString().split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
  return res.status(401).send('Invalid credentials.');
}

// Map /admin.html to existing file in src or bridge/admin.html with authentication
app.get('/admin.html', adminAuth, (req, res) => {
  try {
    const srcAdmin = path.join(__dirname, '../frontend/src', 'admin.html');
    if (fs.existsSync(srcAdmin)) return res.sendFile(srcAdmin);
  } catch (_) { }
  try {
    const bridgeAdmin = path.join(__dirname, './bridge', 'admin.html');
    if (fs.existsSync(bridgeAdmin)) return res.sendFile(bridgeAdmin);
  } catch (_) { }
  return res.status(404).send('admin.html not found');
});

// Logout endpoint - always returns 401 to clear cached credentials
app.get('/admin/logout', (req, res) => {
  res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
  res.status(401).send('Logged out');
});

// Curl-style request/response logging to console
app.use((req, res, next) => {
  try {
    const host = req.get('host') || 'localhost';
    const protocol = req.protocol || 'http';
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;

    const headerFlags = Object.entries(req.headers || {})
      .filter(([k]) => !['connection'].includes(k.toLowerCase()))
      .map(([k, v]) => `-H '${k}: ${String(v)}'`)
      .join(' ');

    let dataFlag = '';
    if (req.method !== 'GET' && req.body && Object.keys(req.body).length) {
      const bodyStr = JSON.stringify(req.body);
      const escaped = bodyStr.replace(/'/g, `'\\''`);
      dataFlag = `--data '${escaped}'`;
    }

    const curl = [`curl -X ${req.method}`, `'${fullUrl}'`, headerFlags, dataFlag]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`REQUEST curl: ${curl}`);

    const origJson = res.json.bind(res);
    const origSend = res.send.bind(res);
    res.json = (body) => { res.locals._respBody = body; return origJson(body); };
    res.send = (body) => { res.locals._respBody = body; return origSend(body); };

    res.on('finish', () => {
      let out = res.locals._respBody;
      try { if (typeof out !== 'string') out = JSON.stringify(out); } catch (_) { }
      if (out && out.length > 5000) out = out.slice(0, 5000) + '... [truncated]';
      console.log(`RESPONSE ${req.method} ${req.originalUrl} -> ${res.statusCode}${out ? `\n${out}` : ''}`);
    });
  } catch (_) { }
  next();
});

// API to get device_id from file
app.get('/api/device_id_file', (req, res) => {
  try {
    const file = path.join(pixoraDir(), 'device-id.txt');

    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: 'Device ID not found' });
    }

    const deviceId = fs.readFileSync(file, 'utf8').trim();
    if (!deviceId) {
      return res.status(404).json({ error: 'Device ID empty' });
    }

    return res.json({ success: true, deviceId });
  } catch (e) {
    console.error('device_id_file error:', e);
    return res.status(500).json({ error: 'Error reading device ID file' });
  }
});

// Admin API to set location_code (writes to file)
app.post('/admin/save_location_code', adminAuth, (req, res) => {
  const { location_code } = req.body;
  if (!location_code || typeof location_code !== 'string') {
    return res.status(400).json({ success: false, error: 'location_code required' });
  }
  try {
    const f = path.join(pixoraDir(), 'location-code.txt');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, location_code.trim(), 'utf8');
    res.json({ success: true, location_code });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get order status route
const getOrderRouter = require('./routes/getOrder');
app.use('/api', getOrderRouter);

// Apply to all /admin routes
app.use('/admin', adminAuth);

// Mount admin booth routes
const adminBoothsRouter = require('./routes/adminBooths');
app.use('/admin', adminBoothsRouter);

// Booth authentication middleware
const authenticateBooth = require('./middleware/authenticateBooth');

// Mount create-order route (secured with booth authentication)
const createOrderRouter = require('./routes/createOrder');
app.use('/api', createOrderRouter);

// Test endpoint to verify booth authentication
app.get('/api/booth/info', authenticateBooth, (req, res) => {
  res.json({
    success: true,
    message: 'Booth authenticated successfully',
    booth: req.booth
  });
});

// Health check
app.get('/health', (req, res) => {
  const environment = process.env.CASHFREE_ENV;
  const cfgBase = appConfig && appConfig.cashfree && appConfig.cashfree.apiBase;
  const apiBase = environment === 'production'
    ? ((cfgBase && cfgBase.production) || 'https://api.cashfree.com/pg/orders')
    : ((cfgBase && cfgBase.sandbox) || 'https://sandbox.cashfree.com/pg/orders');
  res.json({
    status: 'running',
    environment,
    apiBase,
    appIdPresent: Boolean(process.env.CASHFREE_APP_ID),
    secretPresent: Boolean(process.env.CASHFREE_SECRET_KEY),
    apiVersion: process.env.CASHFREE_API_VERSION || '2025-01-01',
    timestamp: new Date().toISOString()
  });
});

// Start server with diagnostics
const server = app.listen(3000, () => {
  try {
    const addr = server.address();
    if (typeof addr === 'string') {
      console.log(`Server listening at ${addr}`);
      console.log(`Health check: ${addr}/health`);
    } else {
      const url = `http://127.0.0.1:${addr.port}`;
      console.log(`Server listening at ${url}`);
      console.log(`Health check: ${url}/health`);
    }
  } catch (e) {
    console.log('Server started');
  }
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

server.on('close', () => {
  console.warn('Server closed');
});

process.on('uncaughtException', (err) => {
  try { console.error('Uncaught exception:', err); } catch (_) { }
});
process.on('unhandledRejection', (reason, promise) => {
  try { console.error('Unhandled rejection:', reason); } catch (_) { }
});