import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/entries/:registerId — get all entries for a register
router.get('/entries/:registerId', async (req, res) => {
  try {
    const regId = Number(req.params.registerId);
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '200');
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    // Verify access
    const userRes = await query('SELECT allowed_registers, allowed_columns FROM cashbook_users WHERE id = $1', [req.userId]);
    if (userRes.rowCount === 0) return res.status(401).json({ error: 'User not found' });

    const allowedRegisters = (userRes.rows[0].allowed_registers || []).map(Number);
    if (!allowedRegisters.includes(regId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get register columns for mapping
    const regRes = await query('SELECT columns FROM registers WHERE id = $1', [regId]);
    if (regRes.rowCount === 0) return res.status(404).json({ error: 'Register not found' });

    const allCols = regRes.rows[0].columns || [];
    const allowedColumns = userRes.rows[0].allowed_columns || {};
    const userCols = allowedColumns[String(regId)];
    const visibleCols = userCols && Array.isArray(userCols) && userCols.length > 0
      ? allCols.filter(c => userCols.includes(c.id))
      : allCols;
    const visibleColIds = new Set(visibleCols.map(c => String(c.id)));

    // Get total count
    const countRes = await query('SELECT COUNT(*) as cnt FROM entries WHERE register_id = $1', [regId]);
    const total = parseInt(countRes.rows[0].cnt);

    // Get entries
    const entriesRes = await query(
      'SELECT id, register_id, row_number, cells, page_index, created_at FROM entries WHERE register_id = $1 ORDER BY row_number ASC',
      [regId]
    );

    // Filter cells to only show allowed columns
    let entries = entriesRes.rows.map(e => {
      const filteredCells = {};
      const cells = e.cells || {};
      for (const [colId, value] of Object.entries(cells)) {
        if (visibleColIds.has(colId)) {
          filteredCells[colId] = value;
        }
      }
      return {
        id: Number(e.id),
        registerId: Number(e.register_id),
        rowNumber: e.row_number,
        cells: filteredCells,
        pageIndex: e.page_index,
        createdAt: e.created_at
      };
    });

    // Client-side search within visible cells
    if (search) {
      const searchLower = search.toLowerCase();
      entries = entries.filter(e => {
        return Object.values(e.cells).some(v =>
          String(v || '').toLowerCase().includes(searchLower)
        );
      });
    }

    return res.json({
      entries,
      columns: visibleCols,
      pagination: {
        page: 1,
        limit: total,
        total,
        totalPages: 1
      }
    });
  } catch (err) {
    console.error('Entries error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/entries/:registerId/:entryId — update an entry's cells
router.put('/entries/:registerId/:entryId', async (req, res) => {
  try {
    const regId = Number(req.params.registerId);
    const entryId = Number(req.params.entryId);
    const { columnId, value, columnName } = req.body;

    // Verify access and edit permission
    const userRes = await query('SELECT * FROM cashbook_users WHERE id = $1', [req.userId]);
    if (userRes.rowCount === 0) return res.status(401).json({ error: 'User not found' });

    const user = userRes.rows[0];
    if (!user.can_edit) return res.status(403).json({ error: 'Edit permission not granted' });

    const allowedRegisters = (user.allowed_registers || []).map(Number);
    if (!allowedRegisters.includes(regId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get current entry
    const entryRes = await query('SELECT * FROM entries WHERE id = $1 AND register_id = $2', [entryId, regId]);
    if (entryRes.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });

    const entry = entryRes.rows[0];
    const oldCells = entry.cells || {};
    const oldValue = oldCells[String(columnId)] || '';

    // Update the specific cell
    const newCells = { ...oldCells, [String(columnId)]: value };
    await query('UPDATE entries SET cells = $1 WHERE id = $2 AND register_id = $3', [
      JSON.stringify(newCells), entryId, regId
    ]);

    // Update register timestamp
    await query('UPDATE registers SET updated_at = NOW() WHERE id = $1', [regId]);

    // Get register name for the log
    const regRes = await query('SELECT name FROM registers WHERE id = $1', [regId]);
    const regName = regRes.rows[0]?.name || 'Unknown';

    // Create activity log with cashbook_ prefix
    const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    await query(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp, register_id, register_name, entry_id)
      VALUES ($1, $2, $3, 'cashbook_edit', $4, NOW(), $5, $6, $7)
    `, [
      logId,
      user.id,
      user.name,
      JSON.stringify({
        columnId: String(columnId),
        columnName: columnName || 'Unknown',
        oldValue: String(oldValue),
        newValue: String(value),
        source: 'cashbook'
      }),
      String(regId),
      regName,
      String(entryId)
    ]);

    return res.json({ message: 'Entry updated', oldValue, newValue: value });
  } catch (err) {
    console.error('Entry update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/student-timeline — query student entries across all allowed registers
router.get('/student-timeline', async (req, res) => {
  try {
    const search = (req.query.search || '').trim().toLowerCase();
    if (!search) {
      return res.json({ records: [] });
    }

    // 1. Get user's allowed registers
    const userRes = await query('SELECT allowed_registers, allowed_columns FROM cashbook_users WHERE id = $1', [req.userId]);
    if (userRes.rowCount === 0) return res.status(401).json({ error: 'User not found' });

    const allowedRegisters = userRes.rows[0].allowed_registers || [];
    const allowedColumns = userRes.rows[0].allowed_columns || {};

    if (allowedRegisters.length === 0) {
      return res.json({ records: [] });
    }

    // 2. Fetch allowed registers and their layouts
    const placeholders = allowedRegisters.map((_, i) => `$${i + 1}`).join(', ');
    const regRes = await query(
      `SELECT id, name, columns FROM registers WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      allowedRegisters.map(Number)
    );

    const records = [];

    // 3. For each register, query entries and match search string
    for (const reg of regRes.rows) {
      const regId = String(reg.id);
      const allCols = reg.columns || [];
      const userCols = allowedColumns[regId];
      const visibleCols = userCols && Array.isArray(userCols) && userCols.length > 0
        ? allCols.filter(c => userCols.includes(c.id))
        : allCols;
      const visibleColIds = new Set(visibleCols.map(c => String(c.id)));

      // Fetch all entries for this register
      const entriesRes = await query(
        'SELECT id, row_number, cells, created_at FROM entries WHERE register_id = $1 ORDER BY row_number ASC',
        [reg.id]
      );

      for (const entry of entriesRes.rows) {
        const cells = entry.cells || {};
        
        // Find if any cell matches the search string
        let isMatch = false;
        let studentName = '';
        let courseName = '';
        let rollNo = '';

        // Check cells for matches
        for (const col of visibleCols) {
          const val = String(cells[String(col.id)] || '');
          const valLower = val.toLowerCase();
          
          if (col.name.toLowerCase().includes('name') && val) {
            studentName = val;
          }
          if ((col.name.toLowerCase().includes('course') || col.name.toLowerCase().includes('department') || col.name.toLowerCase().includes('dept') || col.name.toLowerCase().includes('branch')) && val) {
            courseName = val;
          }
          if ((col.name.toLowerCase().includes('id') || col.name.toLowerCase().includes('rb') || col.name.toLowerCase().includes('roll')) && val) {
            rollNo = val;
          }

          if (valLower.includes(search)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          // Filter cells to show only allowed columns
          const filteredCells = [];
          for (const col of visibleCols) {
            const val = cells[String(col.id)] || '';
            filteredCells.push({
              columnId: col.id,
              columnName: col.name,
              columnType: col.type,
              dropdownOptions: col.dropdownOptions || [],
              value: val
            });
          }

          records.push({
            id: Number(entry.id),
            registerId: Number(reg.id),
            registerName: reg.name,
            rowNumber: entry.row_number,
            studentName: studentName || 'Unknown Student',
            course: courseName || 'N/A',
            rollNo: rollNo || 'N/A',
            fields: filteredCells,
            createdAt: entry.created_at
          });
        }
      }
    }

    return res.json({ records });
  } catch (err) {
    console.error('Timeline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
