const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();
const appConfig = require('./config.json');

const app = express();
app.use(express.json());

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

// Cashfree REST: we call the HTTP PG endpoints via axios; no SDK client needed here

// In-memory storage for payment statuses (for single machine use)
const paymentStatuses = new Map();

// Helper: environment + credentials diagnostics
function getEnvInfo() {
  const environment = process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox';
  const cfgBase = appConfig && appConfig.cashfree && appConfig.cashfree.apiBase;
  const apiBase = environment === 'production'
    ? ((cfgBase && cfgBase.production) || 'https://api.cashfree.com/pg/orders')
    : ((cfgBase && cfgBase.sandbox) || 'https://sandbox.cashfree.com/pg/orders');
  const appIdPresent = Boolean(process.env.CASHFREE_APP_ID);
  const secretPresent = Boolean(process.env.CASHFREE_SECRET_KEY);
  const apiVersion = process.env.CASHFREE_API_VERSION || '2025-01-01';
  return { environment, apiBase, appIdPresent, secretPresent, apiVersion };
}

// Create QR Code for UPI payment
app.post('/api/create-qr', async (req, res) => {
  try {
    const { amount, description } = req.body;
    const orderId = `order_${Date.now()}`;

    const isProd = process.env.CASHFREE_ENV === 'production';
    const CASHFREE_API_URL = isProd
      ? 'https://api.cashfree.com/pg/orders'
      : 'https://sandbox.cashfree.com/pg/orders';

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
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': process.env.CASHFREE_APP_ID,
          'x-client-secret': process.env.CASHFREE_SECRET_KEY,
          'x-api-version': '2023-08-01'
        }
      }
    );

    const data = cfResp.data;

    res.json({
      success: true,
      order_id: data.order_id,
      payment_session_id: data.payment_session_id,
      env: isProd ? 'production' : 'sandbox'
    });

  } catch (error) {
    console.error(error?.response?.data || error.message);
    res.status(500).json({ success: false });
  }
});

// Check payment status
app.get('/api/check-payment/:id', async (req, res) => {
  try {
    // Early validation: credentials must be present to query Cashfree
    const { environment, apiBase, appIdPresent, secretPresent, apiVersion } = getEnvInfo();
    if (!appIdPresent || !secretPresent) {
      return res.status(400).json({
        success: false,
        error: 'Cashfree credentials missing',
        details: {
          environment,
          apiBase,
          appIdPresent,
          secretPresent,
          apiVersion,
          hint: 'Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in .env and restart the app/server'
        }
      });
    }
    const { id } = req.params;

    // Check in-memory status first
    const cachedStatus = paymentStatuses.get(id);
    if (cachedStatus && (cachedStatus.status === 'PAID' || cachedStatus.status === 'paid')) {
      return res.json({ success: true, paid: true });
    }

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
      paymentStatuses.set(id, {
        ...cachedStatus,
        status: 'PAID',
        orderData: data
      });
      console.log('Payment successful for order:', id);
      return res.json({ success: true, paid: true });
    }

    return res.json({ success: true, paid: false, status: orderStatus });
  } catch (error) {
    const errPayload = error?.response?.data || { message: error.message };
    console.error('Error checking payment (REST):', errPayload);
    res.status(500).json({ success: false, error: 'Failed to check payment', details: errPayload });
  }
});

// Webhook endpoint for Cashfree notifications
app.post('/webhook', (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const body = JSON.stringify(req.body);

    // Log every webhook request for debugging
    console.log('[Webhook] Received:', { headers: req.headers, body: req.body });

    // Verify webhook signature (Cashfree uses HMAC SHA256)
    const signatureString = timestamp + body;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(signatureString)
      .digest('base64');

    if (signature === expectedSignature) {
      const eventType = req.body.type;
      const data = req.body.data;

      console.log('[Webhook] Signature valid. Event:', eventType);

      if (eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
        const orderId = data.order.order_id;
        console.log('[Webhook] Payment webhook received for order:', orderId);
        paymentStatuses.set(orderId, {
          status: 'PAID',
          orderData: data.order,
          paymentData: data.payment,
          updatedAt: Date.now()
        });
      }

      res.json({ status: 'ok' });
    } else {
      console.log('[Webhook] Invalid signature. Expected:', expectedSignature, 'Received:', signature);
      res.status(400).json({ error: 'Invalid signature', expectedSignature, receivedSignature: signature });
    }
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to manually POST webhook payload for debugging
app.post('/webhook/test', (req, res) => {
  try {
    console.log('[Webhook Test] Received:', req.body);
    // Simulate a successful payment webhook
    const eventType = req.body.type || 'PAYMENT_SUCCESS_WEBHOOK';
    const data = req.body.data || {};
    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' && data.order && data.order.order_id) {
      const orderId = data.order.order_id;
      paymentStatuses.set(orderId, {
        status: 'PAID',
        orderData: data.order,
        paymentData: data.payment,
        updatedAt: Date.now()
      });
      console.log('[Webhook Test] Payment status updated for order:', orderId);
      return res.json({ status: 'ok', test: true });
    }
    res.json({ status: 'received', test: true });
  } catch (error) {
    console.error('[Webhook Test] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  const environment = process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox';
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
