#!/usr/bin/env node

/**
 * Test script for /api/get-order endpoint
 */

const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:3000';
const TEST_ORDER_ID = 'ORDER_HKV_1767453848783_9f9253e8'; // Use a real order ID from your DB

async function test() {
    console.log('\n=== Testing /api/get-order endpoint ===\n');

    // Test 1: Valid order ID
    console.log('Test 1: Valid order ID');
    try {
        const response = await axios.get(`${BASE_URL}/api/get-order/${TEST_ORDER_ID}`);
        console.log(`Status: ${response.status}`);
        console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
    } catch (error) {
        console.log(`Status: ${error.response?.status}`);
        console.log(`Error: ${JSON.stringify(error.response?.data, null, 2)}`);
    }

    // Test 2: Invalid order ID
    console.log('\n\nTest 2: Invalid/non-existent order ID');
    try {
        const response = await axios.get(`${BASE_URL}/api/get-order/invalid_order_123`);
        console.log(`Status: ${response.status}`);
        console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
    } catch (error) {
        console.log(`Status: ${error.response?.status}`);
        console.log(`Error: ${JSON.stringify(error.response?.data, null, 2)}`);
    }

    // Test 3: Empty order ID
    console.log('\n\nTest 3: Empty order ID (should 404)');
    try {
        const response = await axios.get(`${BASE_URL}/api/get-order/`);
        console.log(`Status: ${response.status}`);
        console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
    } catch (error) {
        console.log(`Status: ${error.response?.status}`);
        console.log(`Message: Endpoint not found (expected)`);
    }

    console.log('\n\n=== Tests completed ===\n');
}

test().catch(console.error);
