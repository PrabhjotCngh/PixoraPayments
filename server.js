const express = require('express');
const { Cashfree } = require('cashfree-pg');
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
      try { if (typeof out !== 'string') out = JSON.stringify(out); } catch (_) {}
      if (out && out.length > 5000) out = out.slice(0, 5000) + '... [truncated]';
      console.log(`RESPONSE ${req.method} ${req.originalUrl} -> ${res.statusCode}${out ? `\n${out}` : ''}`);
    });
  } catch (_) {}
  next();
});

// Initialize Cashfree v5.1.0 client
const cfEnv = process.env.CASHFREE_ENV === 'production' ? Cashfree.PRODUCTION : Cashfree.SANDBOX;
const cashfree = new Cashfree(cfEnv, process.env.CASHFREE_APP_ID, process.env.CASHFREE_SECRET_KEY);

// In-memory storage for payment statuses (for single machine use)
const paymentStatuses = new Map();

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
          notify_url: `https://pixora.textberry.io/webhook`,
          payment_methods: "upi"
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
      id: orderId,
      order_id: data.order_id || orderId,
      payment_session_id: data.payment_session_id,
      image_url: `${CASHFREE_API_URL}/${orderId}/qrcode`,
      payment_link: data.payment_link,
      env: process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox'
    };

    paymentStatuses.set(orderId, {
      status: data.order_status || 'ACTIVE',
      orderData: data,
      amount: amount,
      createdAt: Date.now()
    });

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

    const cfResp = await axios.get(`${CASHFREE_API_BASE}/${encodeURIComponent(id)}` , {
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

    // Verify webhook signature (Cashfree uses HMAC SHA256)
    const signatureString = timestamp + body;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(signatureString)
      .digest('base64');

    if (signature === expectedSignature) {
      const eventType = req.body.type;
      const data = req.body.data;

      if (eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
        const orderId = data.order.order_id;
        console.log('Payment webhook received for order:', orderId);
        
        paymentStatuses.set(orderId, {
          status: 'PAID',
          orderData: data.order,
          paymentData: data.payment,
          updatedAt: Date.now()
        });
      }

      res.json({ status: 'ok' });
    } else {
      console.log('Invalid webhook signature');
      res.status(400).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Webhook error:', error);
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