import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';

const router = Router();

function hashPassword(password) {
  const saltPassword = password + '__sjvps_salt_2024__';
  return crypto.createHash('sha256').update(saltPassword).digest('hex');
}

// POST /api/cashbook-auth/login
router.post('/cashbook-auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const result = await query('SELECT * FROM cashbook_users WHERE LOWER(email) = $1', [email.toLowerCase().trim()]);
    if (result.rowCount === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const user = result.rows[0];
    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
    }

    const inputHash = hashPassword(password);
    if (inputHash !== user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Record login
    await query('UPDATE cashbook_users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Activity log
    const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    await query(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
      VALUES ($1, $2, $3, 'cashbook_login', $4, NOW())
    `, [logId, user.id, user.name, `Cashbook login: ${user.email}`]);

    // Token
    const token = Buffer.from(JSON.stringify({
      id: user.id,
      email: user.email,
      type: 'cashbook',
      ts: Date.now()
    })).toString('base64');

    return res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email, status: user.status,
        phone: user.phone || '', lastLogin: user.last_login,
        allowedRegisters: user.allowed_registers || [],
        allowedColumns: user.allowed_columns || {},
        canEdit: user.can_edit || false
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/cashbook-auth/me
router.get('/cashbook-auth/me', async (req, res) => {
  try {
    const result = await query('SELECT * FROM cashbook_users WHERE id = $1', [req.userId]);
    if (result.rowCount === 0) return res.status(401).json({ error: 'User not found' });

    const user = result.rows[0];
    return res.json({
      user: {
        id: user.id, name: user.name, email: user.email, status: user.status,
        phone: user.phone || '', lastLogin: user.last_login,
        allowedRegisters: user.allowed_registers || [],
        allowedColumns: user.allowed_columns || {},
        canEdit: user.can_edit || false
      }
    });
  } catch (err) {
    console.error('Auth/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
