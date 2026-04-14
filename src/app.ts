import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { getDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Require JWT_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

// Date utility
const todayStr = () => new Date().toISOString().split('T')[0];

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const rateLimit = (maxRequests: number, windowMs: number) => (req: any, res: any, next: any) => {
  const ip = (req.ip || req.socket?.remoteAddress || 'unknown') as string;
  const key = `${req.path}:${ip}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  entry.count++;
  if (entry.count > maxRequests) {
    return res.status(429).json({ error: 'Too many requests, please try again later' });
  }
  next();
};

// Middleware to authenticate user
const requireAuth = (req: any, res: any, next: any) => {
  let token = req.cookies.auth_token;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const AUTH_COOKIE_OPTIONS = {
  secure: true,
  sameSite: 'lax' as const,
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000
};

const VALID_MILESTONE_STATUSES = new Set(['locked', 'active', 'completed']);

export const createApp = async () => {
  const app = express();
  const db = await getDb();

  app.use(express.json());
  app.use(cookieParser());

  const authRateLimit = rateLimit(10, 15 * 60 * 1000); // 10 requests per 15 min per IP

  // Auth Routes
  app.post('/api/auth/register', authRateLimit, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (typeof email !== 'string' || !email.includes('@') || email.length > 254) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const google_id = 'local:' + normalizedEmail;
      const recoveryCode = randomBytes(4).toString('hex').toUpperCase();
      const now = new Date().toISOString();

      const result = await db.query(
        'INSERT INTO users (google_id, email, password, recovery_code, recovery_code_created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [google_id, normalizedEmail, hashedPassword, recoveryCode, now]
      );

      const userId = result.lastInsertRowid || result.rows[0]?.id;
      const authToken = jwt.sign({ id: userId, email: normalizedEmail }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', authToken, AUTH_COOKIE_OPTIONS);

      res.json({ success: true, user: { id: userId, email: normalizedEmail, recoveryCode }, token: authToken });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/login', authRateLimit, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
      const user = result.rows[0];

      if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const authToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', authToken, AUTH_COOKIE_OPTIONS);

      res.json({ success: true, user: { id: user.id, email: user.email, name: user.name }, token: authToken });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/reset-password', authRateLimit, async (req, res) => {
    const { email, recoveryCode, newPassword } = req.body;
    if (!email || !recoveryCode || !newPassword) {
      return res.status(400).json({ error: 'Email, recovery code, and new password are required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const normalizedCode = String(recoveryCode).trim().toUpperCase();
      const result = await db.query(
        'SELECT id, recovery_code_created_at FROM users WHERE email = $1 AND recovery_code = $2',
        [normalizedEmail, normalizedCode]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Invalid email or recovery code' });
      }

      // Enforce 24-hour expiry on recovery codes
      const createdAt = result.rows[0].recovery_code_created_at;
      if (createdAt) {
        const expiresAt = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000;
        if (Date.now() > expiresAt) {
          return res.status(400).json({ error: 'Recovery code has expired. Please contact support to get a new one.' });
        }
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      // Rotate recovery code after use so it can't be reused
      const newRecoveryCode = randomBytes(4).toString('hex').toUpperCase();
      await db.query(
        'UPDATE users SET password = $1, recovery_code = $2, recovery_code_created_at = $3 WHERE email = $4',
        [hashedPassword, newRecoveryCode, new Date().toISOString(), normalizedEmail]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Password reset failed' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: any, res) => {
    const result = await db.query('SELECT id, email, name, picture FROM users WHERE id = $1', [req.user.id]);
    res.json(result.rows[0]);
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token', { secure: true, sameSite: 'lax', httpOnly: true });
    res.json({ success: true });
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      env: process.env.NODE_ENV,
      cwd: process.cwd(),
      dirname: __dirname
    });
  });

  app.get('/api/habits', requireAuth, async (req: any, res) => {
    try {
      const today = todayStr();
      const rawDate = req.query.date as string | undefined;
      const targetDate = (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate <= today)
        ? rawDate
        : today;

      const habitsResult = await db.query(
        'SELECT * FROM habits WHERE archived = 0 AND user_id = $1 ORDER BY created_at DESC',
        [req.user.id]
      );
      const maxDateResult = await db.query(
        'SELECT MAX(date) as max_date FROM completions WHERE user_id = $1',
        [req.user.id]
      );
      const lastCompletionResult = await db.query(
        'SELECT habit_id, MAX(date) as last_date FROM completions WHERE user_id = $1 GROUP BY habit_id',
        [req.user.id]
      );
      const completionsResult = await db.query(
        'SELECT habit_id, status FROM completions WHERE date = $1 AND user_id = $2',
        [targetDate, req.user.id]
      );

      const maxDateStr = maxDateResult.rows[0]?.max_date;
      const lastCompletionMap = new Map(lastCompletionResult.rows.map((r: any) => [r.habit_id, r.last_date]));
      const completionsMap = new Map(completionsResult.rows.map((c: any) => [c.habit_id, c.status || 'completed']));

      let thresholdDateStr: string | null = null;
      if (maxDateStr) {
        const d = new Date(maxDateStr);
        d.setDate(d.getDate() - 30);
        thresholdDateStr = d.toISOString().split('T')[0];
      }

      const habits = habitsResult.rows
        .filter((h: any) => {
          if (!thresholdDateStr) return true;
          const lastDate = lastCompletionMap.get(h.id);
          if (!lastDate) return true;
          return lastDate >= thresholdDateStr;
        })
        .map((h: any) => ({
          ...h,
          completed: completionsMap.get(h.id) === 'completed',
          status: completionsMap.get(h.id) || null
        }));

      res.json(habits);
    } catch (err) {
      console.error('GET /api/habits error:', err);
      res.status(500).json({ error: 'Failed to fetch habits' });
    }
  });

  app.get('/api/habits/archived', requireAuth, async (req: any, res) => {
    const result = await db.query(
      'SELECT * FROM habits WHERE archived = 1 AND user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  });

  app.post('/api/habits/:id/restore', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    await db.query('UPDATE habits SET archived = 0 WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
  });

  app.post('/api/habits', requireAuth, async (req: any, res) => {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const { frequency } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (title.length > 100) return res.status(400).json({ error: 'Title must be 100 characters or less' });

    try {
      const result = await db.query(
        'INSERT INTO habits (user_id, title, frequency) VALUES ($1, $2, $3) RETURNING id',
        [req.user.id, title, frequency || 'daily']
      );

      const newId = result.lastInsertRowid || result.rows[0]?.id;
      res.json({ id: newId, title, frequency: frequency || 'daily', completed: false });
    } catch (error) {
      console.error('Database error during habit creation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/habits/:id', requireAuth, async (req: any, res) => {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const { frequency } = req.body;
    const { id } = req.params;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (title.length > 100) return res.status(400).json({ error: 'Title must be 100 characters or less' });

    await db.query(
      'UPDATE habits SET title = $1, frequency = $2 WHERE id = $3 AND user_id = $4',
      [title, frequency, id, req.user.id]
    );
    res.json({ success: true });
  });

  app.delete('/api/habits/:id', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    await db.query('UPDATE habits SET archived = 1 WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
  });

  app.post('/api/habits/:id/skip', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { date } = req.body;
    const targetDate = date || todayStr();

    const habitResult = await db.query(
      'SELECT id FROM habits WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (habitResult.rows.length === 0) return res.status(404).json({ error: 'Habit not found' });

    const checkResult = await db.query(
      'SELECT id, status FROM completions WHERE habit_id = $1 AND date = $2 AND user_id = $3',
      [id, targetDate, req.user.id]
    );
    const existing = checkResult.rows[0];

    if (existing) {
      if (existing.status === 'skipped') {
        await db.query('DELETE FROM completions WHERE id = $1 AND user_id = $2', [existing.id, req.user.id]);
        return res.json({ status: null, completed: false });
      } else {
        await db.query(
          'UPDATE completions SET status = $1 WHERE id = $2 AND user_id = $3',
          ['skipped', existing.id, req.user.id]
        );
        return res.json({ status: 'skipped', completed: false });
      }
    }

    await db.query(
      'INSERT INTO completions (habit_id, user_id, date, status) VALUES ($1, $2, $3, $4)',
      [id, req.user.id, targetDate, 'skipped']
    );
    res.json({ status: 'skipped', completed: false });
  });

  app.post('/api/habits/:id/toggle', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { date } = req.body;
    const targetDate = date || todayStr();

    const habitResult = await db.query(
      'SELECT id FROM habits WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (habitResult.rows.length === 0) return res.status(404).json({ error: 'Habit not found' });

    const checkResult = await db.query(
      'SELECT id, status FROM completions WHERE habit_id = $1 AND date = $2 AND user_id = $3',
      [id, targetDate, req.user.id]
    );
    const existing = checkResult.rows[0];

    if (existing) {
      if (existing.status === 'completed') {
        await db.query('DELETE FROM completions WHERE id = $1 AND user_id = $2', [existing.id, req.user.id]);
        return res.json({ completed: false, status: null });
      } else {
        await db.query(
          'UPDATE completions SET status = $1 WHERE id = $2 AND user_id = $3',
          ['completed', existing.id, req.user.id]
        );
        return res.json({ completed: true, status: 'completed' });
      }
    }

    await db.query(
      'INSERT INTO completions (habit_id, user_id, date, status) VALUES ($1, $2, $3, $4)',
      [id, req.user.id, targetDate, 'completed']
    );
    res.json({ completed: true, status: 'completed' });
  });

  app.get('/api/stats', requireAuth, async (req: any, res) => {
    // Heatmap: per-day completed count AND total tracked (for accurate % per day)
    const heatmapResult = await db.query(
      `SELECT date,
         CAST(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS INTEGER) as count,
         CAST(COUNT(*) AS INTEGER) as total
       FROM completions WHERE user_id = $1 GROUP BY date`,
      [req.user.id]
    );

    const habitsResult = await db.query(
      'SELECT id, created_at FROM habits WHERE archived = 0 AND user_id = $1',
      [req.user.id]
    );
    const maxDateResult = await db.query(
      'SELECT MAX(date) as max_date FROM completions WHERE user_id = $1',
      [req.user.id]
    );
    const lastCompletionResult = await db.query(
      'SELECT habit_id, MAX(date) as last_date FROM completions WHERE user_id = $1 GROUP BY habit_id',
      [req.user.id]
    );
    const activeHabitsPerMonthResult = await db.query(`
      SELECT SUBSTR(date, 1, 7) as month, COUNT(DISTINCT habit_id) as count
      FROM completions
      WHERE user_id = $1
      GROUP BY SUBSTR(date, 1, 7)
    `, [req.user.id]);
    const totalCompletedResult = await db.query(
      "SELECT COUNT(*) as count FROM completions WHERE user_id = $1 AND status = 'completed'",
      [req.user.id]
    );
    const totalRecordsResult = await db.query(
      'SELECT COUNT(*) as count FROM completions WHERE user_id = $1',
      [req.user.id]
    );

    const maxDateStr = maxDateResult.rows[0]?.max_date || null;
    const lastCompletionMap = new Map(lastCompletionResult.rows.map((r: any) => [r.habit_id, r.last_date]));

    let thresholdDateStr: string | null = null;
    if (maxDateStr) {
      const d = new Date(maxDateStr);
      d.setDate(d.getDate() - 30);
      thresholdDateStr = d.toISOString().split('T')[0];
    }

    const activeHabitsCount = habitsResult.rows.filter((h: any) => {
      if (!thresholdDateStr) return true;
      const lastDate = lastCompletionMap.get(h.id);
      if (!lastDate) return true;
      return lastDate >= thresholdDateStr;
    }).length;

    const totalCompleted = parseInt(totalCompletedResult.rows[0]?.count || '0');
    const totalRecords = parseInt(totalRecordsResult.rows[0]?.count || '0');
    const completionRate = totalRecords > 0 ? Math.round((totalCompleted / totalRecords) * 100) : 0;

    // Calculate current streak (only days with at least one completed habit)
    const datesWithCompletions = heatmapResult.rows
      .filter((r: any) => parseInt(r.count) > 0)
      .map((r: any) => r.date).sort().reverse();
    let currentStreak = 0;

    const now = new Date();
    const todayDateStr = now.toISOString().split('T')[0];
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDateStr = yesterday.toISOString().split('T')[0];

    let checkDate = new Date(now);
    let checkDateStr = todayDateStr;

    if (!datesWithCompletions.includes(todayDateStr) && datesWithCompletions.includes(yesterdayDateStr)) {
      checkDate = new Date(yesterday);
      checkDateStr = yesterdayDateStr;
    }

    while (datesWithCompletions.includes(checkDateStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
      checkDateStr = checkDate.toISOString().split('T')[0];
    }

    res.json({
      heatmap: heatmapResult.rows,
      totalHabits: activeHabitsCount,
      activeHabitsPerMonth: activeHabitsPerMonthResult.rows,
      completionRate,
      currentStreak
    });
  });

  app.post('/api/reset', requireAuth, async (req: any, res) => {
    await db.query('DELETE FROM completions WHERE user_id = $1', [req.user.id]);
    await db.query('DELETE FROM habits WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  });

  app.post('/api/seed', requireAuth, async (req: any, res) => {
    await db.query('DELETE FROM completions WHERE user_id = $1', [req.user.id]);
    await db.query('DELETE FROM habits WHERE user_id = $1', [req.user.id]);

    const habitTitles = ['Drink 2L Water', 'Read 30 mins', 'Meditate', 'No Sugar', 'Run 5km'];
    const habitIds: number[] = [];

    for (const title of habitTitles) {
      const result = await db.query(
        'INSERT INTO habits (user_id, title, frequency) VALUES ($1, $2, $3) RETURNING id',
        [req.user.id, title, 'daily']
      );
      habitIds.push(result.lastInsertRowid as number || result.rows[0]?.id);
    }

    // Build all rows in memory, then insert in chunks to stay under SQLite's 999 parameter limit
    const rows: [number, number, string, string][] = [];
    const start = new Date('2026-01-01');
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      for (let i = 0; i < habitIds.length; i++) {
        const status = Math.random() > (i === 0 ? 0.2 : 0.5) ? 'completed' : 'skipped';
        rows.push([habitIds[i], req.user.id, dateStr, status]);
      }
      current.setDate(current.getDate() + 1);
    }

    // 50 rows × 4 params = 200 params per chunk, well within SQLite's 999 limit
    const CHUNK_SIZE = 50;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map((_, j) => `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`);
      await db.query(
        `INSERT INTO completions (habit_id, user_id, date, status) VALUES ${placeholders.join(', ')}`,
        chunk.flat()
      );
    }

    res.json({ success: true });
  });

  app.post('/api/import', requireAuth, async (req: any, res) => {
    const { data } = req.body;

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    let importedCount = 0;

    try {
      for (const item of data) {
        if (!item.title || !item.date) continue;
        const title = String(item.title).trim().slice(0, 100);
        if (!title) continue;

        let habitResult = await db.query(
          'SELECT id FROM habits WHERE title = $1 AND user_id = $2',
          [title, req.user.id]
        );
        let habitId = habitResult.rows[0]?.id;

        if (!habitId) {
          const insertResult = await db.query(
            'INSERT INTO habits (user_id, title, frequency) VALUES ($1, $2, $3) RETURNING id',
            [req.user.id, title, 'daily']
          );
          habitId = insertResult.lastInsertRowid || insertResult.rows[0]?.id;
        }

        if (habitId) {
          // Prefer explicit status field; fall back to completed boolean
          const newStatus: string = item.status === 'skipped' ? 'skipped'
            : item.status === 'completed' ? 'completed'
            : item.completed !== false ? 'completed' : 'skipped';
          const checkResult = await db.query(
            'SELECT id, status FROM completions WHERE habit_id = $1 AND date = $2 AND user_id = $3',
            [habitId, item.date, req.user.id]
          );
          const existing = checkResult.rows[0];

          if (!existing) {
            await db.query(
              'INSERT INTO completions (habit_id, user_id, date, status) VALUES ($1, $2, $3, $4)',
              [habitId, req.user.id, item.date, newStatus]
            );
            importedCount++;
          } else if (existing.status !== newStatus) {
            await db.query('UPDATE completions SET status = $1 WHERE id = $2', [newStatus, existing.id]);
            importedCount++;
          }
        }
      }
      res.json({ success: true, count: importedCount });
    } catch (error) {
      console.error('Import error:', error);
      res.status(500).json({ error: 'Failed to import data' });
    }
  });

  // Day detail: all completions for a specific date (including archived habits)
  app.get('/api/completions/:date', requireAuth, async (req: any, res) => {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    try {
      const result = await db.query(
        `SELECT h.title, c.status
         FROM completions c
         JOIN habits h ON c.habit_id = h.id
         WHERE c.date = $1 AND c.user_id = $2
         ORDER BY c.status DESC, h.title ASC`,
        [date, req.user.id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error('GET /api/completions/:date error:', err);
      res.status(500).json({ error: 'Failed to fetch completions' });
    }
  });

  // --- Milestones API ---
  app.get('/api/milestones', requireAuth, async (req: any, res) => {
    try {
      const nodesResult = await db.query('SELECT * FROM milestones WHERE user_id = $1', [req.user.id]);
      const edgesResult = await db.query('SELECT * FROM milestone_edges WHERE user_id = $1', [req.user.id]);
      res.json({ nodes: nodesResult.rows, edges: edgesResult.rows });
    } catch (error) {
      console.error('Failed to fetch milestones:', error);
      res.status(500).json({ error: 'Failed to fetch milestones' });
    }
  });

  app.post('/api/milestones', requireAuth, async (req: any, res) => {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const { x, y, status } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (title.length > 100) return res.status(400).json({ error: 'Title must be 100 characters or less' });
    if (typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ error: 'x and y must be numbers' });
    const resolvedStatus = VALID_MILESTONE_STATUSES.has(status) ? status : 'locked';

    try {
      const result = await db.query(
        'INSERT INTO milestones (user_id, title, x, y, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [req.user.id, title, x, y, resolvedStatus]
      );
      const id = result.lastInsertRowid || result.rows[0]?.id;
      res.json({ id, user_id: req.user.id, title, x, y, status: resolvedStatus });
    } catch (error) {
      console.error('Failed to create milestone:', error);
      res.status(500).json({ error: 'Failed to create milestone' });
    }
  });

  app.put('/api/milestones/:id', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const { x, y, status } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (title.length > 100) return res.status(400).json({ error: 'Title must be 100 characters or less' });
    if (typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ error: 'x and y must be numbers' });
    if (status !== undefined && !VALID_MILESTONE_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be locked, active, or completed' });
    }

    try {
      await db.query(
        'UPDATE milestones SET title = $1, x = $2, y = $3, status = $4 WHERE id = $5 AND user_id = $6',
        [title, x, y, status, id, req.user.id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to update milestone:', error);
      res.status(500).json({ error: 'Failed to update milestone' });
    }
  });

  app.delete('/api/milestones/:id', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    try {
      await db.query('DELETE FROM milestones WHERE id = $1 AND user_id = $2', [id, req.user.id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete milestone:', error);
      res.status(500).json({ error: 'Failed to delete milestone' });
    }
  });

  app.post('/api/milestones/edges', requireAuth, async (req: any, res) => {
    const { from_id, to_id } = req.body;
    if (!from_id || !to_id) return res.status(400).json({ error: 'from_id and to_id are required' });

    try {
      const result = await db.query(
        'INSERT INTO milestone_edges (user_id, from_id, to_id) VALUES ($1, $2, $3) RETURNING id',
        [req.user.id, from_id, to_id]
      );
      const id = result.lastInsertRowid || result.rows[0]?.id;
      res.json({ id, user_id: req.user.id, from_id, to_id });
    } catch (error) {
      console.error('Failed to create edge:', error);
      res.status(500).json({ error: 'Failed to create edge' });
    }
  });

  app.delete('/api/milestones/edges/:id', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    try {
      await db.query('DELETE FROM milestone_edges WHERE id = $1 AND user_id = $2', [id, req.user.id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete edge:', error);
      res.status(500).json({ error: 'Failed to delete edge' });
    }
  });

  return app;
};
