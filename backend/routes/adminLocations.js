const express = require('express');
const router = express.Router();
const locationService = require('../services/locationService');

/**
 * GET /admin/locations
 * List all active locations
 */
router.get('/locations', async (req, res) => {
    try {
        const locations = await locationService.listLocations();

        res.json({
            success: true,
            locations,
            count: locations.length
        });
    } catch (error) {
        console.error('List locations error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /admin/locations
 * Create a new location
 */
router.post('/locations', async (req, res) => {
    try {
        const { location_key, location_name, city } = req.body;

        if (!location_key || !location_name || !city) {
            return res.status(400).json({
                success: false,
                error: 'location_key, location_name, and city are required'
            });
        }

        const location = await locationService.createLocation({
            location_key,
            location_name,
            city
        });

        res.status(201).json({
            success: true,
            location
        });
    } catch (error) {
        console.error('Create location error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /admin/locations/:key
 * Get location details by location_key
 */
router.get('/locations/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const location = await locationService.getLocationByKey(key);

        if (!location) {
            return res.status(404).json({
                success: false,
                error: 'Location not found'
            });
        }

        res.json({
            success: true,
            location
        });
    } catch (error) {
        console.error('Get location error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /admin/locations/:key
 * Update location details
 */
router.put('/locations/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { location_name, city, active } = req.body;

        if (!location_name && !city && active === undefined) {
            return res.status(400).json({
                success: false,
                error: 'At least one field (location_name, city, or active) must be provided'
            });
        }

        const location = await locationService.updateLocation(key, {
            location_name,
            city,
            active
        });

        res.json({
            success: true,
            location
        });
    } catch (error) {
        console.error('Update location error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /admin/locations/:key
 * Deactivate a location
 */
router.delete('/locations/:key', async (req, res) => {
    try {
        const { key } = req.params;

        const location = await locationService.deleteLocation(key);

        res.json({
            success: true,
            message: `Location "${key}" has been deactivated`,
            location
        });
    } catch (error) {
        console.error('Delete location error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
