const express = require('express');
const { Cashfree } = require('cashfree-pg');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.WEBHOOK_PORT || 3000;

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

    const CASHFREE_API_URL = process.env.CASHFREE_ENV === 'production'
      ? 'https://api.cashfree.com/pg/orders'
      : 'https://sandbox.cashfree.com/pg/orders';

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
          notify_url: `http://localhost:${PORT}/webhook`,
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
      payment_link: data.payment_link
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
    const CASHFREE_API_BASE = process.env.CASHFREE_ENV === 'production'
      ? 'https://api.cashfree.com/pg/orders'
      : 'https://sandbox.cashfree.com/pg/orders';

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
  res.json({ status: 'running', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Webhook server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});