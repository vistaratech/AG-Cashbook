import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import registerRoutes from './routes/registers.js';
import entryRoutes from './routes/entries.js';
import historyRoutes from './routes/history.js';

dotenv.config();

const app = express();
const PORT = process.env.CASHBOOK_PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth middleware
function authMiddleware(req, res, next) {
  // Skip auth for login
  if (req.path === '/cashbook-auth/login' || req.path === '/api/cashbook-auth/login') return next();

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    if (decoded.type !== 'cashbook') return res.status(401).json({ error: 'Invalid token type' });
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Apply auth middleware to all /api routes except login
app.use('/api', authMiddleware);

// Routes
app.use('/api', authRoutes);
app.use('/api', registerRoutes);
app.use('/api', entryRoutes);
app.use('/api', historyRoutes);

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🟢 Cashbook API server running on http://localhost:${PORT}`);
  });
}

export default app;
