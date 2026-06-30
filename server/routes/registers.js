import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/registers — returns only registers the user is allowed to access
router.get('/registers', async (req, res) => {
  try {
    // Get user's allowed registers
    const userRes = await query('SELECT allowed_registers, allowed_columns FROM cashbook_users WHERE id = $1', [req.userId]);
    if (userRes.rowCount === 0) return res.status(401).json({ error: 'User not found' });

    const allowedRegisters = userRes.rows[0].allowed_registers || [];
    const allowedColumns = userRes.rows[0].allowed_columns || {};

    if (allowedRegisters.length === 0) {
      return res.json({ registers: [], folders: [] });
    }

    // Fetch allowed registers
    const placeholders = allowedRegisters.map((_, i) => `$${i + 1}`).join(', ');
    const regRes = await query(
      `SELECT id, business_id, folder_id, name, icon, icon_color, category, template, 
              columns, entry_count, created_at, updated_at 
       FROM registers 
       WHERE id IN (${placeholders}) AND deleted_at IS NULL 
       ORDER BY name ASC`,
      allowedRegisters.map(Number)
    );

    // Get unique folder IDs
    const folderIds = [...new Set(regRes.rows.filter(r => r.folder_id).map(r => r.folder_id))];
    let folders = [];
    if (folderIds.length > 0) {
      const fPlaceholders = folderIds.map((_, i) => `$${i + 1}`).join(', ');
      const fRes = await query(
        `SELECT id, name FROM folders WHERE id IN (${fPlaceholders}) ORDER BY name ASC`,
        folderIds
      );
      folders = fRes.rows.map(f => ({ id: Number(f.id), name: f.name }));
    }

    // Filter columns based on user's allowed columns
    const registers = regRes.rows.map(r => {
      const regId = String(r.id);
      const allCols = r.columns || [];
      const userCols = allowedColumns[regId];
      
      // If no column restrictions, show all columns
      const filteredCols = userCols && Array.isArray(userCols) && userCols.length > 0
        ? allCols.filter(c => userCols.includes(c.id))
        : allCols;

      return {
        id: Number(r.id),
        folderId: r.folder_id ? Number(r.folder_id) : null,
        name: r.name,
        icon: r.icon,
        iconColor: r.icon_color,
        category: r.category,
        entryCount: r.entry_count || 0,
        columns: filteredCols,
        allColumnIds: allCols.map(c => c.id), // For reference
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
    });

    return res.json({ registers, folders });
  } catch (err) {
    console.error('Registers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/registers/:id — single register detail
router.get('/registers/:id', async (req, res) => {
  try {
    const regId = Number(req.params.id);

    // Verify user has access
    const userRes = await query('SELECT allowed_registers, allowed_columns FROM cashbook_users WHERE id = $1', [req.userId]);
    if (userRes.rowCount === 0) return res.status(401).json({ error: 'User not found' });

    const allowedRegisters = (userRes.rows[0].allowed_registers || []).map(Number);
    if (!allowedRegisters.includes(regId)) {
      return res.status(403).json({ error: 'Access denied to this register' });
    }

    const regRes = await query('SELECT * FROM registers WHERE id = $1 AND deleted_at IS NULL', [regId]);
    if (regRes.rowCount === 0) return res.status(404).json({ error: 'Register not found' });

    const reg = regRes.rows[0];
    const allowedColumns = userRes.rows[0].allowed_columns || {};
    const userCols = allowedColumns[String(regId)];
    const allCols = reg.columns || [];
    const filteredCols = userCols && Array.isArray(userCols) && userCols.length > 0
      ? allCols.filter(c => userCols.includes(c.id))
      : allCols;

    return res.json({
      id: Number(reg.id),
      name: reg.name,
      columns: filteredCols,
      allColumns: allCols,
      entryCount: reg.entry_count || 0,
      pages: reg.pages || [],
      folderId: reg.folder_id ? Number(reg.folder_id) : null
    });
  } catch (err) {
    console.error('Register detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
