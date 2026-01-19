const db = require('../database/db');

/**
 * Location Service - Manages location CRUD operations
 */

/**
 * List all active locations
 */
async function listLocations() {
    try {
        const query = await db.query(
            'SELECT id, location_key, location_name, city, active, created_at FROM locations WHERE active = true ORDER BY created_at DESC'
        );
        return query.rows;
    } catch (error) {
        throw new Error(`List locations error: ${error.message}`);
    }
}

/**
 * Get location by location_key
 */
async function getLocationByKey(locationKey) {
    try {
        const query = await db.query(
            'SELECT id, location_key, location_name, city, active, created_at FROM locations WHERE location_key = $1',
            [locationKey.toUpperCase()]
        );
        return query.rowCount > 0 ? query.rows[0] : null;
    } catch (error) {
        throw new Error(`Get location error: ${error.message}`);
    }
}

/**
 * Create a new location
 */
async function createLocation(locationData) {
    try {
        const { location_key, location_name, city } = locationData;

        if (!location_key || !location_name || !city) {
            throw new Error('location_key, location_name, and city are required');
        }

        const key = location_key.toUpperCase().trim();
        const name = location_name.trim();
        const cityName = city.trim();

        // Check if location already exists
        const existing = await db.query(
            'SELECT location_key FROM locations WHERE location_key = $1',
            [key]
        );

        if (existing.rowCount > 0) {
            throw new Error('Location with this key already exists');
        }

        // Create the location
        const query = await db.query(
            `INSERT INTO locations (location_key, location_name, city, active, created_at)
       VALUES ($1, $2, $3, true, NOW())
       RETURNING id, location_key, location_name, city, active, created_at`,
            [key, name, cityName]
        );

        return query.rows[0];
    } catch (error) {
        throw new Error(`Create location error: ${error.message}`);
    }
}

/**
 * Update a location
 */
async function updateLocation(locationKey, updateData) {
    try {
        const key = locationKey.toUpperCase().trim();

        // Check if location exists
        const existing = await db.query(
            'SELECT id FROM locations WHERE location_key = $1',
            [key]
        );

        if (existing.rowCount === 0) {
            throw new Error('Location not found');
        }

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (updateData.location_name) {
            updates.push(`location_name = $${paramCount++}`);
            values.push(updateData.location_name.trim());
        }

        if (updateData.city) {
            updates.push(`city = $${paramCount++}`);
            values.push(updateData.city.trim());
        }

        if (updateData.active !== undefined) {
            updates.push(`active = $${paramCount++}`);
            values.push(updateData.active);
        }

        if (updates.length === 0) {
            throw new Error('No fields to update');
        }

        values.push(key);
        const query = await db.query(
            `UPDATE locations SET ${updates.join(', ')} WHERE location_key = $${paramCount} RETURNING id, location_key, location_name, city, active, created_at`,
            values
        );

        return query.rows[0];
    } catch (error) {
        throw new Error(`Update location error: ${error.message}`);
    }
}

/**
 * Delete/deactivate a location
 */
async function deleteLocation(locationKey) {
    try {
        const key = locationKey.toUpperCase().trim();

        // Check if location exists
        const existing = await db.query(
            'SELECT id FROM locations WHERE location_key = $1',
            [key]
        );

        if (existing.rowCount === 0) {
            throw new Error('Location not found');
        }

        // Check if location has active booths
        const boothCount = await db.query(
            'SELECT COUNT(*) as count FROM booths WHERE location_key = $1 AND status = $2',
            [key, 'active']
        );

        if (boothCount.rows[0].count > 0) {
            throw new Error(`Cannot delete location with ${boothCount.rows[0].count} active booth(s). Deactivate booths first.`);
        }

        // Deactivate the location
        const query = await db.query(
            'UPDATE locations SET active = false WHERE location_key = $1 RETURNING id, location_key, location_name, city, active, created_at',
            [key]
        );

        return query.rows[0];
    } catch (error) {
        throw new Error(`Delete location error: ${error.message}`);
    }
}

module.exports = {
    listLocations,
    getLocationByKey,
    createLocation,
    updateLocation,
    deleteLocation
};
