const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const axios = require('axios');
const crypto = require('crypto');

/**
 * Create a Cashfree order via API
 * @param {Object} params - { amount, description, locationKey }
 * @returns {Object} - Cashfree order response with order_id, payment_session_id
 */
async function createCashfreeOrder({ amount, description, locationKey }) {
    const orderId = `ORDER_${locationKey}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const cashfreePayload = {
        order_id: orderId,
        order_amount: (amount / 100).toFixed(2), // Convert paise to rupees
        order_currency: 'INR',
        order_note: description || 'Pixora Photorooms Session',
        customer_details: {
            customer_id: `BOOTH_${locationKey}_${Date.now()}`,
            customer_phone: '9999999999'
        },
        order_meta: {
            return_url: `https://pixora.textberry.io/thankyou.html?order_id=${encodeURIComponent(orderId)}`
        },
        order_tags: {
            location_code: locationKey
        }
    };

    try {
        // Determine API URL based on environment
        const isProduction = process.env.CASHFREE_ENV === 'production' &&
            !process.env.CASHFREE_APP_ID.includes('TEST');
        const apiUrl = isProduction
            ? 'https://api.cashfree.com/pg/orders'
            : 'https://sandbox.cashfree.com/pg/orders';

        const response = await axios.post(
            apiUrl,
            cashfreePayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-client-id': process.env.CASHFREE_APP_ID,
                    'x-client-secret': process.env.CASHFREE_SECRET_KEY,
                    'x-api-version': process.env.CASHFREE_API_VERSION || '2025-01-01'
                },
                timeout: 15000 // 15 second timeout
            }
        );

        return {
            order_id: orderId,
            cashfree_order_id: response.data.cf_order_id || response.data.order_id,
            payment_session_id: response.data.payment_session_id,
            order_status: response.data.order_status,
            order_code: response.data.order_code
        };
    } catch (error) {
        console.error('Cashfree API Error:', error.response?.data || error.message);
        throw new Error(`Cashfree order creation failed: ${error.response?.data?.message || error.message}`);
    }
}

/**
 * Create an order with idempotency support
 * @param {Object} params - { booth_id, location_key, amount, description, idempotency_key }
 * @returns {Object} - Created or existing order
 */
async function createOrder({ booth_id, location_key, amount, description, idempotency_key }) {
    return await db.transaction(async (client) => {
        // Check if order with this idempotency_key already exists
        const existingOrderQuery = `
      SELECT 
        id, booth_id, order_id, location_key, amount, 
        cashfree_order_id, status, idempotency_key, created_at
      FROM orders
      WHERE idempotency_key = $1
    `;

        const existingResult = await client.query(existingOrderQuery, [idempotency_key]);

        if (existingResult.rows.length > 0) {
            console.log(`Idempotent request detected: ${idempotency_key}, returning existing order`);
            return {
                isExisting: true,
                order: existingResult.rows[0]
            };
        }

        // Create new Cashfree order
        const cashfreeOrder = await createCashfreeOrder({
            amount,
            description,
            locationKey: location_key
        });

        // Insert into database
        const insertQuery = `
      INSERT INTO orders (
        id, booth_id, order_id, location_key, amount,
        cashfree_order_id, status, idempotency_key, order_code, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `;

        const orderId = uuidv4();
        const insertResult = await client.query(insertQuery, [
            orderId,
            booth_id,
            cashfreeOrder.order_id,
            location_key,
            amount,
            cashfreeOrder.cashfree_order_id,
            'pending',
            idempotency_key,
            cashfreeOrder.order_code || null
        ]);

        return {
            isExisting: false,
            order: insertResult.rows[0],
            payment_session_id: cashfreeOrder.payment_session_id,
            order_code: cashfreeOrder.order_code
        };
    });
}

/**
 * Get order by ID
 */
async function getOrderById(orderId) {
    const query = 'SELECT * FROM orders WHERE id = $1';
    const result = await db.query(query, [orderId]);
    return result.rows[0] || null;
}

/**
 * Get order by idempotency key
 */
async function getOrderByIdempotencyKey(idempotencyKey) {
    const query = 'SELECT * FROM orders WHERE idempotency_key = $1';
    const result = await db.query(query, [idempotencyKey]);
    return result.rows[0] || null;
}

/**
 * Update order status (e.g., after payment callback)
 */
async function updateOrderStatus(orderId, status) {
    const query = 'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *';
    const result = await db.query(query, [status, orderId]);
    return result.rows[0] || null;
}

/**
 * List orders for a specific booth
 */
async function listOrdersByBooth(boothId, limit = 50) {
    const query = `
    SELECT * FROM orders 
    WHERE booth_id = $1 
    ORDER BY created_at DESC 
    LIMIT $2
  `;
    const result = await db.query(query, [boothId, limit]);
    return result.rows;
}

/**
 * Get order status from Cashfree
 * @param {string} orderId - Cashfree order_id
 * @returns {Object} - Order status and payment information
 */
async function getOrder(orderId) {
    // Determine API URL based on environment
    const isProduction = process.env.CASHFREE_ENV === 'production' &&
        !process.env.CASHFREE_APP_ID.includes('TEST');
    const apiUrl = isProduction
        ? 'https://api.cashfree.com/pg/orders'
        : 'https://sandbox.cashfree.com/pg/orders';

    try {
        const response = await axios.get(`${apiUrl}/${encodeURIComponent(orderId)}`, {
            headers: {
                'x-client-id': process.env.CASHFREE_APP_ID,
                'x-client-secret': process.env.CASHFREE_SECRET_KEY,
                'x-api-version': process.env.CASHFREE_API_VERSION || '2025-01-01'
            },
            timeout: 10000
        });

        const data = response.data;
        return {
            success: true,
            paid: data.order_status === 'PAID',
            status: data.order_status,
            orderAmount: data.order_amount,
            orderId: data.order_id
        };
    } catch (error) {
        console.error('Error fetching order from Cashfree:', error.response?.data || error.message);
        throw new Error(`Failed to fetch order: ${error.response?.data?.message || error.message}`);
    }
}

module.exports = {
    createOrder,
    getOrderById,
    getOrderByIdempotencyKey,
    updateOrderStatus,
    listOrdersByBooth,
    getOrder
};
