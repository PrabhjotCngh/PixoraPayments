const express = require('express');
const router = express.Router();
const { validate: isUUID } = require('uuid');
const authenticateBooth = require('../middleware/authenticateBooth');
const orderService = require('../services/orderService');

/**
 * POST /api/create-order
 * Create an order for payment
 * 
 * Security:
 * - Booth authentication required (Authorization: Bearer <api_key>)
 * - Idempotency via X-Idempotency-Key header (must be UUID)
 * - Location key comes from authenticated booth only
 * 
 * Request:
 * Headers:
 *   - Authorization: Bearer <booth_api_key>
 *   - X-Idempotency-Key: <uuid>
 * Body:
 *   - amount: number (in paise, e.g., 20000 for ₹200)
 *   - description: string (optional)
 */
router.post('/create-order', authenticateBooth, async (req, res) => {
  try {
    const { description } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'];

    // Validate idempotency key
    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing X-Idempotency-Key header. Must be a UUID.'
      });
    }

    if (!isUUID(idempotencyKey)) {
      return res.status(400).json({
        success: false,
        error: 'X-Idempotency-Key must be a valid UUID'
      });
    }

    // Security: location_key, booth_code, and price_inr come from authenticated booth only
    const { id: booth_id, location_key, booth_code, price_inr } = req.booth;

    // Server determines amount from booth's configured price (not from client)
    const boothPriceInr = price_inr || 250.00; // Default to ₹250 if not set
    const amountInPaise = Math.round(boothPriceInr * 100);

    // Validate amount
    if (amountInPaise <= 0 || amountInPaise > 1000000) { // Max ₹10,000
      return res.status(400).json({
        success: false,
        error: 'Invalid booth price. Price must be between ₹0.01 and ₹10,000'
      });
    }

    // Create order with idempotency
    const result = await orderService.createOrder({
      booth_id,
      location_key,
      booth_code,  // ✅ Unique booth identifier
      amount: amountInPaise,  // Use server-determined amount from booth price
      description: description || `Payment at ${booth_code}`,
      idempotency_key: idempotencyKey
    });

    if (result.isExisting) {
      // Return existing order (idempotent request)
      return res.status(200).json({
        success: true,
        idempotent: true,
        message: 'Order already exists for this idempotency key',
        qrCode: {
          order_id: result.order.order_id,
          payment_session_id: null, // Cannot retrieve session for existing order
          env: process.env.CASHFREE_ENV
        },
        order: {
          id: result.order.id,
          order_id: result.order.order_id,
          amount: result.order.amount,
          amount_inr: boothPriceInr,  // Include configured booth price
          location_key: result.order.location_key,
          status: result.order.status,
          created_at: result.order.created_at
        }
      });
    }

    // Return new order
    return res.status(201).json({
      success: true,
      idempotent: false,
      message: 'Order created successfully',
      qrCode: {
        order_id: result.order.order_id,
        payment_session_id: result.payment_session_id,
        env: process.env.CASHFREE_ENV,
        order_code: result.order_code
      },
      order: {
        id: result.order.id,
        order_id: result.order.order_id,
        amount: result.order.amount,
        amount_inr: boothPriceInr,  // Include configured booth price
        location_key: result.order.location_key,
        status: result.order.status,
        created_at: result.order.created_at
      }
    });

  } catch (error) {
    console.error('Error in /api/create-order:', error);

    // Handle Cashfree API errors specifically
    if (error.message.includes('Cashfree')) {
      return res.status(502).json({
        success: false,
        error: 'Payment gateway error. Please try again.',
        details: error.message
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: error.message
    });
  }
});

module.exports = router;
