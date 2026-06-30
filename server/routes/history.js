import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/history — cashbook activity history
router.get('/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '100');
    const offset = (page - 1) * limit;
    const registerId = req.query.registerId || null;
    const action = req.query.action || null;

    let queryText = `SELECT * FROM activity_logs WHERE action LIKE 'cashbook_%'`;
    const params = [];

    if (registerId) {
      params.push(String(registerId));
      queryText += ` AND register_id = $${params.length}`;
    }

    if (action) {
      params.push(action);
      queryText += ` AND action = $${params.length}`;
    }

    // Count
    const countQuery = queryText.replace('SELECT *', 'SELECT COUNT(*) as cnt');
    const countRes = await query(countQuery, params);
    const total = parseInt(countRes.rows[0].cnt);

    queryText += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(queryText, params);

    const activities = result.rows.map(r => {
      let parsedDetails = {};
      try {
        parsedDetails = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {});
      } catch { parsedDetails = { raw: r.details }; }

      return {
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        action: r.action,
        details: parsedDetails,
        timestamp: r.timestamp,
        registerId: r.register_id,
        registerName: r.register_name,
        entryId: r.entry_id
      };
    });

    return res.json({
      activities,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
