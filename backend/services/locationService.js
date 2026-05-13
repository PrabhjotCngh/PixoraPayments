const db = require('../database/db');
const { buildCredentialUpdateFields, maskAppId } = require('./cashfreeCredentialService');

/**
 * Location Service - Manages location CRUD operations
 */

function toLocationResponse(row) {
    const hasCustomCredentials = Boolean(row.cashfree_app_id && row.cashfree_secret_key_encrypted);

    return {
        id: row.id,
        location_key: row.location_key,
        location_name: row.location_name,
        city: row.city,
        active: row.active,
        created_at: row.created_at,
        has_custom_cashfree_credentials: hasCustomCredentials,
        credential_source: hasCustomCredentials ? 'custom' : 'default',
        masked_app_id: hasCustomCredentials ? maskAppId(row.cashfree_app_id) : null,
        cashfree_credential_env: row.cashfree_credential_env || null,
        cashfree_credentials_updated_at: row.cashfree_credentials_updated_at || null
    };
}

/**
 * List all active locations
 */
async function listLocations() {
    try {
        const query = await db.query(
            `SELECT
                id, location_key, location_name, city, active, created_at,
                cashfree_app_id, cashfree_secret_key_encrypted,
                cashfree_credential_env, cashfree_credentials_updated_at
            FROM locations
            WHERE active = true
            ORDER BY created_at DESC`
        );
        return query.rows.map(toLocationResponse);
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
            `SELECT
                id, location_key, location_name, city, active, created_at,
                cashfree_app_id, cashfree_secret_key_encrypted,
                cashfree_credential_env, cashfree_credentials_updated_at
            FROM locations
            WHERE location_key = $1`,
            [locationKey.toUpperCase()]
        );
        return query.rowCount > 0 ? toLocationResponse(query.rows[0]) : null;
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

        const credentialFields = buildCredentialUpdateFields(locationData);
        const hasCredentialFields = Object.keys(credentialFields).length > 0;

        const baseColumns = ['location_key', 'location_name', 'city', 'active', 'created_at'];
        const baseValues = [key, name, cityName, true, new Date()];

        let insertColumns = [...baseColumns];
        let insertValues = [...baseValues];

        if (hasCredentialFields) {
            for (const [column, value] of Object.entries(credentialFields)) {
                insertColumns.push(column);
                insertValues.push(value);
            }
        }

        const placeholders = insertValues.map((_, idx) => `$${idx + 1}`);
        const query = await db.query(
            `INSERT INTO locations (${insertColumns.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING
                id, location_key, location_name, city, active, created_at,
                cashfree_app_id, cashfree_secret_key_encrypted,
                cashfree_credential_env, cashfree_credentials_updated_at`,
            insertValues
        );

        return toLocationResponse(query.rows[0]);
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

        const credentialFields = buildCredentialUpdateFields(updateData);
        for (const [column, value] of Object.entries(credentialFields)) {
            updates.push(`${column} = $${paramCount++}`);
            values.push(value);
        }

        if (updates.length === 0) {
            throw new Error('No fields to update');
        }

        values.push(key);
        const query = await db.query(
            `UPDATE locations SET ${updates.join(', ')} WHERE location_key = $${paramCount}
             RETURNING
                id, location_key, location_name, city, active, created_at,
                cashfree_app_id, cashfree_secret_key_encrypted,
                cashfree_credential_env, cashfree_credentials_updated_at`,
            values
        );

        return toLocationResponse(query.rows[0]);
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
            `UPDATE locations SET active = false WHERE location_key = $1
             RETURNING
                id, location_key, location_name, city, active, created_at,
                cashfree_app_id, cashfree_secret_key_encrypted,
                cashfree_credential_env, cashfree_credentials_updated_at`,
            [key]
        );

        return toLocationResponse(query.rows[0]);
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
