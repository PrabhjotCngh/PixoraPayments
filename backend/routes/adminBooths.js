const express = require('express');
const router = express.Router();
const boothService = require('../services/boothService');

/**
 * GET /admin/booths
 * List all booths or filter by location_key
 */
router.get('/booths', async (req, res) => {
  try {
    const { location_key } = req.query;

    let result;
    if (location_key) {
      result = await boothService.listBoothsByLocation(location_key);
    } else {
      // List all booths
      const db = require('../database/db');
      const query = await db.query(
        'SELECT id, booth_name, api_key, location_key, booth_code, status, price_inr, last_seen_at, created_at FROM booths ORDER BY created_at DESC'
      );
      result = query.rows;
    }

    res.json({
      success: true,
      booths: result,
      count: result.length
    });
  } catch (error) {
    console.error('List booths error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/booths
 * Create a new booth
 */
router.post('/booths', async (req, res) => {
  try {
    const { booth_name, location_key, price_inr = 250.00 } = req.body;

    if (!booth_name || !location_key) {
      return res.status(400).json({
        success: false,
        error: 'booth_name and location_key are required'
      });
    }

    // Validate price
    const priceNum = parseFloat(price_inr);
    if (isNaN(priceNum) || priceNum <= 0 || priceNum > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Price must be a number between ₹1 and ₹10,000'
      });
    }

    // Optional: booth_code can be provided or auto-generated
    const { booth_code } = req.body;

    const booth = await boothService.createBooth({
      booth_name: booth_name.trim(),
      location_key: location_key.trim(),
      booth_code: booth_code ? booth_code.trim() : null,
      price_inr: priceNum
    });

    res.status(201).json({
      success: true,
      booth
    });
  } catch (error) {
    console.error('Create booth error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/booths/:id
 * Get booth details by ID
 */
router.get('/booths/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const booth = await boothService.getBoothById(id);

    if (!booth) {
      return res.status(404).json({
        success: false,
        error: 'Booth not found'
      });
    }

    res.json({
      success: true,
      booth
    });
  } catch (error) {
    console.error('Get booth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /admin/booths/:id
 * Update booth details
 */
router.put('/booths/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { booth_name, location_key, status, price_inr } = req.body;

    // Check if booth exists
    const booth = await boothService.getBoothById(id);
    if (!booth) {
      return res.status(404).json({
        success: false,
        error: 'Booth not found'
      });
    }

    // Validate price if provided
    if (price_inr !== undefined) {
      const priceNum = parseFloat(price_inr);
      if (isNaN(priceNum) || priceNum <= 0 || priceNum > 10000) {
        return res.status(400).json({
          success: false,
          error: 'Price must be a number between ₹1 and ₹10,000'
        });
      }
    }

    const db = require('../database/db');
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (booth_name) {
      updates.push(`booth_name = $${paramCount++}`);
      values.push(booth_name.trim());
    }

    if (location_key) {
      // Only validate if location_key is being changed
      if (location_key !== booth.location_key) {
        // Validate location exists
        const locCheck = await db.query(
          'SELECT location_key FROM locations WHERE location_key = $1 AND active = true',
          [location_key]
        );
        if (locCheck.rowCount === 0) {
          return res.status(400).json({
            success: false,
            error: 'Invalid or inactive location_key'
          });
        }
      }
      updates.push(`location_key = $${paramCount++}`);
      values.push(location_key.trim());
    }

    if (status) {
      const validStatuses = ['active', 'inactive', 'maintenance'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }

    if (price_inr !== undefined) {
      updates.push(`price_inr = $${paramCount++}`);
      values.push(parseFloat(price_inr));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    values.push(id);
    await db.query(
      `UPDATE booths SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    const updatedBooth = await boothService.getBoothById(id);

    res.json({
      success: true,
      booth: updatedBooth
    });
  } catch (error) {
    console.error('Update booth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /admin/booths/:id
 * Delete/deactivate a booth
 * If booth is active: deactivate (soft delete)
 * If booth is inactive: permanently delete from database (hard delete)
 */
router.delete('/booths/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if booth exists
    const booth = await boothService.getBoothById(id);
    if (!booth) {
      return res.status(404).json({
        success: false,
        error: 'Booth not found'
      });
    }

    const db = require('../database/db');

    // If booth is inactive, permanently delete it
    if (booth.status === 'inactive') {
      await db.query('DELETE FROM booths WHERE id = $1', [id]);
      res.json({
        success: true,
        message: 'Booth permanently deleted',
        isHardDelete: true
      });
    } else {
      // If booth is active or maintenance, deactivate it (soft delete)
      await boothService.updateBoothStatus(id, 'inactive');
      res.json({
        success: true,
        message: 'Booth deactivated successfully',
        isHardDelete: false
      });
    }
  } catch (error) {
    console.error('Delete booth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/booths/:id/regenerate-key
 * Regenerate API key for a booth
 */
router.post('/booths/:id/regenerate-key', async (req, res) => {
  try {
    const { id } = req.params;
    const crypto = require('crypto');

    // Check if booth exists
    const booth = await boothService.getBoothById(id);
    if (!booth) {
      return res.status(404).json({
        success: false,
        error: 'Booth not found'
      });
    }

    // Generate new API key
    const newApiKey = 'bth_live_' + crypto.randomBytes(32).toString('hex');

    const db = require('../database/db');
    await db.query(
      'UPDATE booths SET api_key = $1 WHERE id = $2',
      [newApiKey, id]
    );

    const updatedBooth = await boothService.getBoothById(id);

    res.json({
      success: true,
      booth: updatedBooth,
      message: 'API key regenerated successfully'
    });
  } catch (error) {
    console.error('Regenerate key error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
