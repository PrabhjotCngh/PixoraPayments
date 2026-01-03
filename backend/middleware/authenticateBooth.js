const db = require('../database/db');

/**
 * Booth Authentication Middleware
 * 
 * Validates booth API key from Authorization header
 * Ensures booth is active and assigned to a location
 * Updates last_seen_at timestamp (heartbeat)
 * Attaches booth object to req.booth for downstream use
 * 
 * Usage: Apply to routes that require booth authentication
 * Example: router.post('/api/orders', authenticateBooth, createOrder)
 */
async function authenticateBooth(req, res, next) {
    try {
        const auth = req.headers.authorization;

        // Check if Authorization header is present
        if (!auth || !auth.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Missing booth API key. Use: Authorization: Bearer <api_key>'
            });
        }

        // Extract API key
        const apiKey = auth.replace('Bearer ', '').trim();

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'Empty API key provided'
            });
        }

        // Query booth by API key
        const result = await db.query(
            `SELECT id, booth_name, location_key, status, last_seen_at, created_at
       FROM booths
       WHERE api_key = $1`,
            [apiKey]
        );

        // Check if booth exists
        if (result.rowCount === 0) {
            console.warn(`Authentication failed: Invalid API key attempted (${apiKey.substring(0, 20)}...)`);
            return res.status(403).json({
                success: false,
                error: 'Invalid booth API key'
            });
        }

        const booth = result.rows[0];

        // Check booth status
        if (booth.status !== 'active') {
            console.warn(`Authentication blocked: Booth ${booth.id} has status '${booth.status}'`);
            return res.status(403).json({
                success: false,
                error: `Booth not active (status: ${booth.status})`,
                booth_id: booth.id,
                booth_name: booth.booth_name
            });
        }

        // Check location assignment
        if (!booth.location_key) {
            console.error(`Booth ${booth.id} is not assigned to any location`);
            return res.status(400).json({
                success: false,
                error: 'Booth is not assigned to a location. Contact admin.',
                booth_id: booth.id
            });
        }

        // Update heartbeat (last_seen_at) - fire and forget, don't block request
        db.query(
            'UPDATE booths SET last_seen_at = NOW() WHERE id = $1',
            [booth.id]
        ).catch(err => {
            console.error(`Failed to update last_seen_at for booth ${booth.id}:`, err.message);
        });

        // Attach booth info to request for downstream handlers
        req.booth = {
            id: booth.id,
            name: booth.booth_name,
            location_key: booth.location_key,
            status: booth.status
        };

        console.log(`Booth authenticated: ${booth.booth_name} (${booth.id}) at ${booth.location_key}`);

        next();
    } catch (err) {
        console.error('authenticateBooth middleware error:', err);
        res.status(500).json({
            success: false,
            error: 'Authentication failed due to server error'
        });
    }
}

module.exports = authenticateBooth;
