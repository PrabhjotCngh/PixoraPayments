const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

/**
 * Create a new booth with generated ID and API key
 * @param {Object} params - Booth creation parameters
 * @param {string} params.booth_name - Name of the booth
 * @param {string} params.location_key - Location key to associate booth with
 * @returns {Promise<Object>} Created booth details with booth_id, api_key, location_key
 * @throws {Error} If location_key is invalid or inactive
 */
async function createBooth({ booth_name, location_key }) {
  // Validate required fields
  if (!booth_name || !location_key) {
    throw new Error('booth_name and location_key are required');
  }

  // Validate location exists and is active
  const loc = await db.query(
    'SELECT location_key FROM locations WHERE location_key = $1 AND active = true',
    [location_key]
  );

  if (loc.rowCount === 0) {
    throw new Error(`Invalid or inactive location_key: ${location_key}`);
  }

  // Generate booth ID and API key
  const boothId = uuidv4();
  const apiKey = 'bth_live_' + crypto.randomBytes(32).toString('hex');

  // Insert booth into database
  await db.query(
    `INSERT INTO booths (id, booth_name, api_key, location_key, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [boothId, booth_name, apiKey, location_key, 'active']
  );

  console.log(`Booth created: ${booth_name} (${boothId}) at location ${location_key}`);

  return {
    booth_id: boothId,
    booth_name,
    api_key: apiKey,
    location_key,
    status: 'active'
  };
}

/**
 * Get booth by ID
 * @param {string} boothId - Booth UUID
 * @returns {Promise<Object|null>} Booth details or null if not found
 */
async function getBoothById(boothId) {
  const result = await db.query(
    'SELECT id, booth_name, api_key, location_key, status, last_seen_at, created_at FROM booths WHERE id = $1',
    [boothId]
  );
  return result.rows[0] || null;
}

/**
 * Get booth by API key
 * @param {string} apiKey - Booth API key
 * @returns {Promise<Object|null>} Booth details or null if not found
 */
async function getBoothByApiKey(apiKey) {
  const result = await db.query(
    'SELECT id, booth_name, api_key, location_key, status, last_seen_at, created_at FROM booths WHERE api_key = $1',
    [apiKey]
  );
  return result.rows[0] || null;
}

/**
 * Update booth last seen timestamp
 * @param {string} boothId - Booth UUID
 * @returns {Promise<void>}
 */
async function updateBoothLastSeen(boothId) {
  await db.query(
    'UPDATE booths SET last_seen_at = NOW() WHERE id = $1',
    [boothId]
  );
}

/**
 * List all booths for a location
 * @param {string} locationKey - Location key
 * @returns {Promise<Array>} Array of booth objects
 */
async function listBoothsByLocation(locationKey) {
  const result = await db.query(
    'SELECT id, booth_name, api_key, location_key, status, last_seen_at, created_at FROM booths WHERE location_key = $1 ORDER BY created_at DESC',
    [locationKey]
  );
  return result.rows;
}

/**
 * Update booth status
 * @param {string} boothId - Booth UUID
 * @param {string} status - New status (active, inactive, maintenance)
 * @returns {Promise<void>}
 */
async function updateBoothStatus(boothId, status) {
  const validStatuses = ['active', 'inactive', 'maintenance'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  await db.query(
    'UPDATE booths SET status = $1 WHERE id = $2',
    [status, boothId]
  );
  console.log(`Booth ${boothId} status updated to: ${status}`);
}

module.exports = {
  createBooth,
  getBoothById,
  getBoothByApiKey,
  updateBoothLastSeen,
  listBoothsByLocation,
  updateBoothStatus
};
