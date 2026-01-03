const express = require('express');
const router = express.Router();
const orderService = require('../services/orderService');

/**
 * GET /api/get-order/:orderId
 * Get order status from Cashfree
 * 
 * Public endpoint - no authentication required
 * Used by payment page to poll order status
 * 
 * @param {string} orderId - Cashfree order_id
 * @returns {Object} - Order status and payment information
 */
router.get('/get-order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    const orderStatus = await orderService.getOrder(orderId);

    if (orderStatus.paid) {
      console.log('Payment successful for order:', orderId);
    }

    return res.json(orderStatus);
  } catch (error) {
    console.error('Error in /api/get-order:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch order status',
      details: error.message
    });
  }
});

module.exports = router;
