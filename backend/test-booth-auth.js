// Test booth authentication middleware
require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:3000';
const ADMIN_USER = 'admin';
const ADMIN_PASS = process.env.ADMIN_BASIC_PASS || 'your_admin_password';

async function testBoothAuth() {
    console.log('=== Testing Booth Authentication Middleware ===\n');

    try {
        // Step 1: Get a valid booth and its API key
        console.log('1. Fetching booth list...');
        const boothsResponse = await axios.get(`${BASE_URL}/admin/booths`, {
            auth: { username: ADMIN_USER, password: ADMIN_PASS }
        });

        const booths = boothsResponse.data.booths;
        if (!booths || booths.length === 0) {
            console.error('No booths found. Create one first.');
            return;
        }

        const activeBooth = booths.find(b => b.status === 'active');
        if (!activeBooth) {
            console.error('No active booths found.');
            return;
        }

        console.log(`   Found booth: ${activeBooth.booth_name} (${activeBooth.id})`);
        console.log(`   API Key: ${activeBooth.api_key.substring(0, 30)}...`);
        console.log(`   Location: ${activeBooth.location_key}\n`);

        // Step 2: Test valid authentication
        console.log('2. Testing valid API key...');
        const validConfig = {
            headers: {
                'Authorization': `Bearer ${activeBooth.api_key}`
            }
        };

        // We'll create a test endpoint later, for now just show the config
        console.log('   ✅ Valid auth config ready\n');

        // Step 3: Test missing API key
        console.log('3. Testing missing API key...');
        console.log('   Expected: 401 Unauthorized\n');

        // Step 4: Test invalid API key
        console.log('4. Testing invalid API key...');
        console.log('   Expected: 403 Forbidden\n');

        // Step 5: Test inactive booth
        const inactiveBooth = booths.find(b => b.status !== 'active');
        if (inactiveBooth) {
            console.log('5. Testing inactive booth...');
            console.log(`   Booth: ${inactiveBooth.booth_name} (status: ${inactiveBooth.status})`);
            console.log('   Expected: 403 Forbidden\n');
        }

        console.log('=== Middleware Tests Ready ===');
        console.log('To test fully, create a protected endpoint and apply authenticateBooth middleware.');
        console.log('\nExample usage:');
        console.log('  router.post(\'/api/orders\', authenticateBooth, (req, res) => {');
        console.log('    const booth = req.booth; // Access authenticated booth');
        console.log('    // ... create order logic');
        console.log('  });');

    } catch (error) {
        console.error('Test failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

testBoothAuth();
