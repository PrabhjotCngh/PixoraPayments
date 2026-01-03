// Test script to create a booth
require('dotenv').config();
const { createBooth, getBoothById, listBoothsByLocation } = require('./services/boothService');

async function testBoothService() {
  try {
    console.log('=== Testing Booth Service ===\n');

    // Create a new booth
    console.log('1. Creating new booth...');
    const newBooth = await createBooth({
      booth_name: 'Test Booth 1',
      location_key: 'HKV'
    });
    console.log('Created booth:', newBooth);
    console.log('');

    // Retrieve booth by ID
    console.log('2. Retrieving booth by ID...');
    const retrieved = await getBoothById(newBooth.booth_id);
    console.log('Retrieved booth:', retrieved);
    console.log('');

    // List booths at location
    console.log('3. Listing all booths at HKV...');
    const booths = await listBoothsByLocation('HKV');
    console.log(`Found ${booths.length} booths at HKV:`);
    booths.forEach(b => {
      console.log(`  - ${b.booth_name} (${b.id}) - ${b.status}`);
    });

    console.log('\n=== Test Complete ===');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

testBoothService();
