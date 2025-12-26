const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();
const appConfig = require('./config.json');

const os = require('os');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());

// Serve static files from src directory
app.use(express.static(path.join(__dirname, 'src')));
console.log('Serving static from:', path.join(__dirname, 'src'));

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

// Helper to read location_code from file
function getLocationCodeFromFile() {
  try {
    const f = path.join(process.cwd(), 'PixoraPayments', 'location-code.txt');
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  } catch (e) {
    log(`location_code file read error: ${e}`);
  }
  return 'NL'; // default
}

function getPixoraDataDir() {
  // Linux / Mac
  if (process.env.XDG_CONFIG_HOME) {
    return process.env.XDG_CONFIG_HOME;
  }

  // Windows
  if (process.env.APPDATA) {
    return process.env.APPDATA;
  }

  // Fallback
  return path.join(os.homedir(), '.config');
}

function getDeviceIdFile() {
  return path.join(
    getPixoraDataDir(),
    'PixoraPayments',
    'device-id.txt'
  );
}

// API to get device_id from file
app.get('/api/device_id_file', (req, res) => {
  try {
    const file = getDeviceIdFile();

    if (fs.existsSync(file)) {
      const v = fs.readFileSync(file, 'utf8').trim();
      if (v) return res.json({ device_id: v });
    }

    return res.status(404).json({ error: 'Device ID not found' });
  } catch (e) {
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
    const f = path.join(process.env.APPDATA || process.cwd(), 'PixoraPayments', 'location-code.txt');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, location_code.trim(), 'utf8');
    res.json({ success: true, location_code });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create QR Code for UPI payment
app.post('/api/create-qr', async (req, res) => {
  try {
    const { amount, description } = req.body;
    const orderId = `order_${Date.now()}`;

    const getCashfreeOrdersBase = () => {
      const isProd = process.env.CASHFREE_ENV === 'production';
      const cfgBase = appConfig && appConfig.cashfree && appConfig.cashfree.apiBase;
      if (isProd) return (cfgBase && cfgBase.production) || 'https://api.cashfree.com/pg/orders';
      return (cfgBase && cfgBase.sandbox) || 'https://sandbox.cashfree.com/pg/orders';
    };
    const CASHFREE_API_URL = getCashfreeOrdersBase();

    // Create Cashfree order via REST (axios)
    // Always use local location_code from file
    const locationCode = getLocationCodeFromFile();
    const cfResp = await axios.post(
      CASHFREE_API_URL,
      {
        order_id: orderId,
        order_amount: (amount / 100).toFixed(2),
        order_currency: 'INR',
        order_note: description || 'Pixora Photorooms Session',
        customer_details: {
          customer_id: `customer_${Date.now()}`,
          customer_phone: '9999999999'
        },
        order_meta: {
          return_url: 'https://pixora.textberry.io/thankyou.html?order_id=' + encodeURIComponent(orderId)
        },
        order_tag: {
          location_code: locationCode
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': process.env.CASHFREE_APP_ID,
          'x-client-secret': process.env.CASHFREE_SECRET_KEY,
          'x-api-version': process.env.CASHFREE_API_VERSION || '2025-01-01'
        }
      }
    );

    const data = cfResp.data;

    // Prepare QR data for frontend
    const qrData = {
      order_id: data.order_id,
      payment_session_id: data.payment_session_id,
      env: process.env.CASHFREE_ENV,
      order_code: data.order_code
    };

    console.log('Cashfree order created (REST):', orderId);
    res.json({ success: true, qrCode: qrData });
  } catch (error) {
    const errPayload = error?.response?.data || { message: error.message };
    console.error('Error creating QR (REST):', errPayload);
    res.status(500).json({ success: false, error: 'Failed to generate QR', details: errPayload });
  }
});

// Check payment status
app.get('/api/check-payment/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch order status from Cashfree via REST (matches your working curl)
    const getCashfreeOrdersBase = () => {
      const isProd = process.env.CASHFREE_ENV === 'production';
      const cfgBase = appConfig && appConfig.cashfree && appConfig.cashfree.apiBase;
      if (isProd) return (cfgBase && cfgBase.production) || 'https://api.cashfree.com/pg/orders';
      return (cfgBase && cfgBase.sandbox) || 'https://sandbox.cashfree.com/pg/orders';
    };
    const CASHFREE_API_BASE = getCashfreeOrdersBase();

    const cfResp = await axios.get(`${CASHFREE_API_BASE}/${encodeURIComponent(id)}`, {
      headers: {
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
        'x-api-version': process.env.CASHFREE_API_VERSION || '2025-01-01'
      }
    });

    const data = cfResp.data;
    const orderStatus = data.order_status;

    if (orderStatus === 'PAID') {
      console.log('Payment successful for order:', id);
      return res.json({ success: true, paid: true, orderAmount: data.order_amount });
    }

    return res.json({ success: true, paid: false, status: orderStatus, orderAmount: data.order_amount });
  } catch (error) {
    const errPayload = error?.response?.data || { message: error.message };
    console.error('Error checking payment (REST):', errPayload);
    res.status(500).json({ success: false, error: 'Failed to check payment', details: errPayload });
  }
});

// Basic auth middleware for /admin routes
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'password';

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm=\"Admin Area\"');
    return res.status(401).send('Authentication required.');
  }
  const b64 = auth.split(' ')[1];
  const [user, pass] = Buffer.from(b64, 'base64').toString().split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm=\"Admin Area\"');
  return res.status(401).send('Invalid credentials.');
}

// Apply to all /admin routes
app.use('/admin', adminAuth);

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

// Start server
app.listen(3000, () => {
  console.log(`Webhook server running on https://pixora.textberry.io`);
  console.log(`Health check: https://pixora.textberry.io/health`);
});