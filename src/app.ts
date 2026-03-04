import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDb } from './db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

// Middleware to authenticate user
const requireAuth = (req: any, res: any, next: any) => {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const createApp = async () => {
  console.log('createApp: Starting...');
  const app = express();
  console.log('createApp: Getting DB...');
  const db = await getDb();
  console.log('createApp: DB initialized.');

  app.use(express.json());
  app.use(cookieParser());

  // Auth Routes
  app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const google_id = 'local:' + email; 
      
      const result = await db.query(
        'INSERT INTO users (google_id, email, password) VALUES ($1, $2, $3) RETURNING id', 
        [google_id, email, hashedPassword]
      );
      
      const userId = result.lastInsertRowid || result.rows[0]?.id;
      const user = { id: userId, email };

      const authToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', authToken, {
        secure: true,
        sameSite: 'none',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({ success: true, user });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];

      if (!user || !user.password) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const authToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', authToken, {
        secure: true,
        sameSite: 'none',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: any, res) => {
    const result = await db.query('SELECT id, email, name, picture FROM users WHERE id = $1', [req.user.id]);
    res.json(result.rows[0]);
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token', {
      secure: true,
      sameSite: 'none',
      httpOnly: true
    });
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
    const habitsResult = await db.query('SELECT * FROM habits WHERE archived = 0 AND user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    
    const today = new Date().toISOString().split('T')[0];
    const completionsResult = await db.query('SELECT habit_id FROM completions WHERE date = $1 AND user_id = $2', [today, req.user.id]);
    
    const completedIds = new Set(completionsResult.rows.map((c: any) => c.habit_id));

    const habitsWithStatus = habitsResult.rows.map((h: any) => ({
      ...h,
      completed: completedIds.has(h.id)
    }));

    res.json(habitsWithStatus);
  });

  app.post('/api/habits', requireAuth, async (req: any, res) => {
    const { title, frequency } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
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
    const { title, frequency } = req.body;
    const { id } = req.params;
    
    await db.query('UPDATE habits SET title = $1, frequency = $2 WHERE id = $3 AND user_id = $4', [title, frequency, id, req.user.id]);
    res.json({ success: true });
  });

  app.delete('/api/habits/:id', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    await db.query('UPDATE habits SET archived = 1 WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
  });

  app.post('/api/habits/:id/toggle', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { date } = req.body; // YYYY-MM-DD
    const targetDate = date || new Date().toISOString().split('T')[0];

    const habitResult = await db.query('SELECT id FROM habits WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (habitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    const checkResult = await db.query('SELECT id FROM completions WHERE habit_id = $1 AND date = $2 AND user_id = $3', [id, targetDate, req.user.id]);
    const existing = checkResult.rows[0];

    if (existing) {
      await db.query('DELETE FROM completions WHERE id = $1 AND user_id = $2', [existing.id, req.user.id]);
      res.json({ completed: false });
    } else {
      await db.query('INSERT INTO completions (habit_id, user_id, date) VALUES ($1, $2, $3)', [id, req.user.id, targetDate]);
      res.json({ completed: true });
    }
  });

  app.get('/api/stats', requireAuth, async (req: any, res) => {
    const completionsResult = await db.query('SELECT date, COUNT(*) as count FROM completions WHERE user_id = $1 GROUP BY date', [req.user.id]);
    const activeHabitsResult = await db.query('SELECT COUNT(*) as count FROM habits WHERE archived = 0 AND user_id = $1', [req.user.id]);
    
    res.json({
      heatmap: completionsResult.rows,
      totalHabits: parseInt(activeHabitsResult.rows[0]?.count || '0')
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

    const habits = ['Drink 2L Water', 'Read 30 mins', 'Meditate', 'No Sugar', 'Run 5km'];
    const habitIds = [];

    for (const title of habits) {
      const result = await db.query('INSERT INTO habits (user_id, title, frequency) VALUES ($1, $2, $3) RETURNING id', [req.user.id, title, 'daily']);
      habitIds.push(result.lastInsertRowid || result.rows[0]?.id);
    }

    const start = new Date('2026-01-01');
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const current = new Date(start);
    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];
      for (const habitId of habitIds) {
        const threshold = habitId === habitIds[0] ? 0.2 : 0.5;
        if (Math.random() > threshold) { 
          await db.query('INSERT INTO completions (habit_id, user_id, date) VALUES ($1, $2, $3)', [habitId, req.user.id, dateStr]);
        }
      }
      current.setDate(current.getDate() + 1);
    }

    res.json({ success: true });
  });

  app.post('/api/import', requireAuth, async (req: any, res) => {
    const { data } = req.body;
    
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    let importedCount = 0;

    // Note: Transactions are complex across different DB adapters.
    // We will do sequential inserts for simplicity in this adapter.
    // For Vercel Postgres, we could use `sql.transaction`, but our adapter is generic.
    
    try {
      for (const item of data) {
        if (!item.title || !item.date) continue;

        // 1. Ensure habit exists
        // Check if exists first
        let habitResult = await db.query('SELECT id FROM habits WHERE title = $1 AND user_id = $2', [item.title.trim(), req.user.id]);
        let habitId = habitResult.rows[0]?.id;

        if (!habitId) {
           const insertResult = await db.query('INSERT INTO habits (user_id, title, frequency) VALUES ($1, $2, $3) RETURNING id', [req.user.id, item.title.trim(), 'daily']);
           habitId = insertResult.lastInsertRowid || insertResult.rows[0]?.id;
        }
        
        if (habitId) {
          const shouldBeCompleted = item.completed !== false;

          if (shouldBeCompleted) {
            const checkResult = await db.query('SELECT id FROM completions WHERE habit_id = $1 AND date = $2 AND user_id = $3', [habitId, item.date, req.user.id]);
            if (checkResult.rows.length === 0) {
              await db.query('INSERT INTO completions (habit_id, user_id, date) VALUES ($1, $2, $3)', [habitId, req.user.id, item.date]);
              importedCount++;
            }
          } else {
            const checkResult = await db.query('SELECT id FROM completions WHERE habit_id = $1 AND date = $2 AND user_id = $3', [habitId, item.date, req.user.id]);
            if (checkResult.rows.length > 0) {
              await db.query('DELETE FROM completions WHERE habit_id = $1 AND date = $2 AND user_id = $3', [habitId, item.date, req.user.id]);
              importedCount++;
            }
          }
        }
      }
      res.json({ success: true, count: importedCount });
    } catch (error) {
      console.error('Import error:', error);
      res.status(500).json({ error: 'Failed to import data' });
    }
  });

  return app;
};
