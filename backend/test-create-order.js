#!/usr/bin/env node

/**
 * Test script for /api/create-order endpoint
 * 
 * Tests:
 * 1. Missing Authorization header
 * 2. Missing X-Idempotency-Key header
 * 3. Invalid idempotency key format
 * 4. Invalid amount
 * 5. Successful order creation
 * 6. Idempotent request (same key returns existing order)
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://127.0.0.1:3000';
const VALID_API_KEY = 'api_hkv_main_001'; // HKV Main Booth
const IDEMPOTENCY_KEY = uuidv4();

async function test() {
  console.log('\n=== Testing /api/create-order endpoint ===\n');

  // Test 1: Missing Authorization header
  console.log('Test 1: Missing Authorization header');
  try {
    await axios.post(`${BASE_URL}/api/create-order`, {
      amount: 20000,
      description: 'Test payment'
    }, {
      headers: {
        'X-Idempotency-Key': uuidv4()
      }
    });
  } catch (error) {
    console.log(`Status: ${error.response.status}`);
    console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
  }

  // Test 2: Missing X-Idempotency-Key header
  console.log('\n\nTest 2: Missing X-Idempotency-Key header');
  try {
    await axios.post(`${BASE_URL}/api/create-order`, {
      amount: 20000,
      description: 'Test payment'
    }, {
      headers: {
        'Authorization': `Bearer ${VALID_API_KEY}`
      }
    });
  } catch (error) {
    console.log(`Status: ${error.response.status}`);
    console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
  }

  // Test 3: Invalid idempotency key format
  console.log('\n\nTest 3: Invalid idempotency key format');
  try {
    await axios.post(`${BASE_URL}/api/create-order`, {
      amount: 20000,
      description: 'Test payment'
    }, {
      headers: {
        'Authorization': `Bearer ${VALID_API_KEY}`,
        'X-Idempotency-Key': 'not-a-uuid'
      }
    });
  } catch (error) {
    console.log(`Status: ${error.response.status}`);
    console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
  }

  // Test 4: Invalid amount
  console.log('\n\nTest 4: Invalid amount');
  try {
    await axios.post(`${BASE_URL}/api/create-order`, {
      amount: -100,
      description: 'Test payment'
    }, {
      headers: {
        'Authorization': `Bearer ${VALID_API_KEY}`,
        'X-Idempotency-Key': uuidv4()
      }
    });
  } catch (error) {
    console.log(`Status: ${error.response.status}`);
    console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
  }

  // Test 5: Successful order creation
  console.log('\n\nTest 5: Successful order creation');
  try {
    const response = await axios.post(`${BASE_URL}/api/create-order`, {
      amount: 20000,
      description: 'Test payment - First request'
    }, {
      headers: {
        'Authorization': `Bearer ${VALID_API_KEY}`,
        'X-Idempotency-Key': IDEMPOTENCY_KEY
      }
    });
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
  } catch (error) {
    console.log(`Status: ${error.response.status}`);
    console.log(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
  }

  // Test 6: Idempotent request (retry with same key)
  console.log('\n\nTest 6: Idempotent request (same idempotency key)');
  try {
    const response = await axios.post(`${BASE_URL}/api/create-order`, {
      amount: 20000,
      description: 'Test payment - Second request (should return same order)'
    }, {
      headers: {
        'Authorization': `Bearer ${VALID_API_KEY}`,
        'X-Idempotency-Key': IDEMPOTENCY_KEY
      }
    });
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
  } catch (error) {
    console.log(`Status: ${error.response.status}`);
    console.log(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
  }

  console.log('\n\n=== Tests completed ===\n');
}

test().catch(console.error);
