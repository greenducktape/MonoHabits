import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDb } from './db.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

// Middleware to authenticate user
const requireAuth = (req: any, res: any, next: any) => {
  let token = req.cookies.auth_token;
  if (!token && req.headers.authorization) {
    if (req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
  }
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
  const app = express();
  const db = await getDb();

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
      const recoveryCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      const result = await db.query(
        'INSERT INTO users (google_id, email, password, recovery_code) VALUES ($1, $2, $3, $4) RETURNING id', 
        [google_id, email, hashedPassword, recoveryCode]
      );
      
      const userId = result.lastInsertRowid || result.rows[0]?.id;
      const user = { id: userId, email, recoveryCode };

      const authToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', authToken, {
        secure: true,
        sameSite: 'none',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({ success: true, user, token: authToken });
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

      res.json({ success: true, user: { id: user.id, email: user.email, name: user.name }, token: authToken });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    const { email, recoveryCode, newPassword } = req.body;
    if (!email || !recoveryCode || !newPassword) {
      return res.status(400).json({ error: 'Email, recovery code, and new password are required' });
    }

    try {
      const result = await db.query('SELECT id FROM users WHERE email = $1 AND recovery_code = $2', [email, recoveryCode]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Invalid email or recovery code' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
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
    
    // Get the latest completion date for the user
    const maxDateResult = await db.query('SELECT MAX(date) as max_date FROM completions WHERE user_id = $1', [req.user.id]);
    const maxDateStr = maxDateResult.rows[0]?.max_date;

    // Get the latest completion date for each habit
    const lastCompletionResult = await db.query('SELECT habit_id, MAX(date) as last_date FROM completions WHERE user_id = $1 GROUP BY habit_id', [req.user.id]);
    const lastCompletionMap = new Map(lastCompletionResult.rows.map((r: any) => [r.habit_id, r.last_date]));

    const today = new Date().toISOString().split('T')[0];
    const completionsResult = await db.query('SELECT habit_id, status FROM completions WHERE date = $1 AND user_id = $2', [today, req.user.id]);
    
    const completionsMap = new Map(completionsResult.rows.map((c: any) => [c.habit_id, c.status || 'completed']));

    let thresholdDateStr: string | null = null;
    if (maxDateStr) {
      const maxDate = new Date(maxDateStr);
      maxDate.setDate(maxDate.getDate() - 30);
      thresholdDateStr = maxDate.toISOString().split('T')[0];
    }

    const habitsWithStatus = habitsResult.rows
      .filter((h: any) => {
        if (!thresholdDateStr) return true; // No completions at all, show everything
        const lastDate = lastCompletionMap.get(h.id);
        if (!lastDate) return true; // Habit has no completions (newly created), show it
        return lastDate >= thresholdDateStr; // Only show if active in the last 30 days of the latest activity
      })
      .map((h: any) => ({
        ...h,
        completed: completionsMap.has(h.id) && completionsMap.get(h.id) === 'completed',
        status: completionsMap.get(h.id) || null
      }));

    res.json(habitsWithStatus);
  });

  app.get('/api/habits/archived', requireAuth, async (req: any, res) => {
    const habitsResult = await db.query('SELECT * FROM habits WHERE archived = 1 AND user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(habitsResult.rows);
  });

  app.post('/api/habits/:id/restore', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    await db.query('UPDATE habits SET archived = 0 WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
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

  app.post('/api/habits/:id/skip', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { date } = req.body; // YYYY-MM-DD
    const targetDate = date || new Date().toISOString().split('T')[0];

    const habitResult = await db.query('SELECT id FROM habits WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (habitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    const checkResult = await db.query('SELECT id, status FROM completions WHERE habit_id = $1 AND date = $2 AND user_id = $3', [id, targetDate, req.user.id]);
    const existing = checkResult.rows[0];

    if (existing) {
      if (existing.status === 'skipped') {
        await db.query('DELETE FROM completions WHERE id = $1 AND user_id = $2', [existing.id, req.user.id]);
        res.json({ status: null, completed: false });
      } else {
        await db.query('UPDATE completions SET status = $1 WHERE id = $2 AND user_id = $3', ['skipped', existing.id, req.user.id]);
        res.json({ status: 'skipped', completed: false });
      }
    } else {
      await db.query('INSERT INTO completions (habit_id, user_id, date, status) VALUES ($1, $2, $3, $4)', [id, req.user.id, targetDate, 'skipped']);
      res.json({ status: 'skipped', completed: false });
    }
  });

  app.post('/api/habits/:id/toggle', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { date } = req.body; // YYYY-MM-DD
    const targetDate = date || new Date().toISOString().split('T')[0];

    const habitResult = await db.query('SELECT id FROM habits WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (habitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    const checkResult = await db.query('SELECT id, status FROM completions WHERE habit_id = $1 AND date = $2 AND user_id = $3', [id, targetDate, req.user.id]);
    const existing = checkResult.rows[0];

    if (existing) {
      if (existing.status === 'completed') {
        await db.query('DELETE FROM completions WHERE id = $1 AND user_id = $2', [existing.id, req.user.id]);
        res.json({ completed: false, status: null });
      } else {
        await db.query('UPDATE completions SET status = $1 WHERE id = $2 AND user_id = $3', ['completed', existing.id, req.user.id]);
        res.json({ completed: true, status: 'completed' });
      }
    } else {
      await db.query('INSERT INTO completions (habit_id, user_id, date, status) VALUES ($1, $2, $3, $4)', [id, req.user.id, targetDate, 'completed']);
      res.json({ completed: true, status: 'completed' });
    }
  });

  app.get('/api/stats', requireAuth, async (req: any, res) => {
    const completionsResult = await db.query("SELECT date, COUNT(*) as count FROM completions WHERE user_id = $1 AND status = 'completed' GROUP BY date", [req.user.id]);
    const habitsResult = await db.query('SELECT id, created_at FROM habits WHERE archived = 0 AND user_id = $1', [req.user.id]);
    
    // Get the latest completion date for the user
    const maxDateResult = await db.query('SELECT MAX(date) as max_date FROM completions WHERE user_id = $1', [req.user.id]);
    const maxDateStr = maxDateResult.rows[0]?.max_date;

    // Get the latest completion date for each habit
    const lastCompletionResult = await db.query('SELECT habit_id, MAX(date) as last_date FROM completions WHERE user_id = $1 GROUP BY habit_id', [req.user.id]);
    const lastCompletionMap = new Map(lastCompletionResult.rows.map((r: any) => [r.habit_id, r.last_date]));

    let thresholdDateStr: string | null = null;
    if (maxDateStr) {
      const maxDate = new Date(maxDateStr);
      maxDate.setDate(maxDate.getDate() - 30);
      thresholdDateStr = maxDate.toISOString().split('T')[0];
    }

    const activeHabitsCount = habitsResult.rows.filter((h: any) => {
      if (!thresholdDateStr) return true;
      const lastDate = lastCompletionMap.get(h.id);
      if (!lastDate) return true;
      return lastDate >= thresholdDateStr;
    }).length;

    const activeHabitsPerMonthResult = await db.query(`
      SELECT SUBSTR(date, 1, 7) as month, COUNT(DISTINCT habit_id) as count 
      FROM completions 
      WHERE user_id = $1 
      GROUP BY SUBSTR(date, 1, 7)
    `, [req.user.id]);

    const totalCompletedResult = await db.query("SELECT COUNT(*) as count FROM completions WHERE user_id = $1 AND status = 'completed'", [req.user.id]);
    const totalRecordsResult = await db.query("SELECT COUNT(*) as count FROM completions WHERE user_id = $1", [req.user.id]);
    
    const totalCompleted = parseInt(totalCompletedResult.rows[0]?.count || '0');
    const totalRecords = parseInt(totalRecordsResult.rows[0]?.count || '0');
    const completionRate = totalRecords > 0 ? Math.round((totalCompleted / totalRecords) * 100) : 0;

    // Calculate current streak (days in a row with at least 1 completion)
    const datesWithCompletions = completionsResult.rows.map((r: any) => r.date).sort().reverse();
    let currentStreak = 0;
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let checkDate = new Date(today);
    let checkDateStr = todayStr;

    // If no completion today, maybe the streak is still alive from yesterday
    if (!datesWithCompletions.includes(todayStr) && datesWithCompletions.includes(yesterdayStr)) {
      checkDate = new Date(yesterday);
      checkDateStr = yesterdayStr;
    }

    while (datesWithCompletions.includes(checkDateStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
      checkDateStr = checkDate.toISOString().split('T')[0];
    }

    res.json({
      heatmap: completionsResult.rows,
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
          await db.query('INSERT INTO completions (habit_id, user_id, date, status) VALUES ($1, $2, $3, $4)', [habitId, req.user.id, dateStr, 'completed']);
        } else {
          await db.query('INSERT INTO completions (habit_id, user_id, date, status) VALUES ($1, $2, $3, $4)', [habitId, req.user.id, dateStr, 'skipped']);
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

          const checkResult = await db.query('SELECT id, status FROM completions WHERE habit_id = $1 AND date = $2 AND user_id = $3', [habitId, item.date, req.user.id]);
          const existing = checkResult.rows[0];

          if (shouldBeCompleted) {
            if (!existing) {
              await db.query('INSERT INTO completions (habit_id, user_id, date, status) VALUES ($1, $2, $3, $4)', [habitId, req.user.id, item.date, 'completed']);
              importedCount++;
            } else if (existing.status !== 'completed') {
              await db.query('UPDATE completions SET status = $1 WHERE id = $2', ['completed', existing.id]);
              importedCount++;
            }
          } else {
            if (!existing) {
              await db.query('INSERT INTO completions (habit_id, user_id, date, status) VALUES ($1, $2, $3, $4)', [habitId, req.user.id, item.date, 'skipped']);
              importedCount++;
            } else if (existing.status !== 'skipped') {
              await db.query('UPDATE completions SET status = $1 WHERE id = $2', ['skipped', existing.id]);
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
