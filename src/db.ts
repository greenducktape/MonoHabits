// --- Database Interface ---
export interface QueryResult {
  rows: any[];
  lastInsertRowid?: number | bigint;
  changes?: number;
}

// --- SQLite Adapter (Local) ---
class SQLiteAdapter {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.init();
  }

  init() {
    // Initialize Database Schema (Same as server.ts)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        picture TEXT,
        password TEXT,
        recovery_code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT NOT NULL,
        frequency TEXT DEFAULT 'daily',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id)
      );

      CREATE TABLE IF NOT EXISTS completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id INTEGER NOT NULL,
        user_id INTEGER,
        date TEXT NOT NULL, -- YYYY-MM-DD
        status TEXT DEFAULT 'completed',
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (habit_id) REFERENCES habits (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      );

      CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'locked', -- locked, active, completed
        x REAL NOT NULL,
        y REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      );

      CREATE TABLE IF NOT EXISTS milestone_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        from_id INTEGER NOT NULL,
        to_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (from_id) REFERENCES milestones (id) ON DELETE CASCADE,
        FOREIGN KEY (to_id) REFERENCES milestones (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
      CREATE INDEX IF NOT EXISTS idx_completions_user_id_date ON completions(user_id, date);
      CREATE INDEX IF NOT EXISTS idx_completions_habit_id ON completions(habit_id);
      CREATE INDEX IF NOT EXISTS idx_milestones_user_id ON milestones(user_id);
      CREATE INDEX IF NOT EXISTS idx_milestone_edges_user_id ON milestone_edges(user_id);
    `);

    // Migrations
    try { this.db.exec(`ALTER TABLE habits ADD COLUMN user_id INTEGER;`); } catch (e) {}
    try { this.db.exec(`ALTER TABLE completions ADD COLUMN user_id INTEGER;`); } catch (e) {}
    try { this.db.exec(`ALTER TABLE completions ADD COLUMN status TEXT DEFAULT 'completed';`); } catch (e) {}
    try { this.db.exec(`ALTER TABLE users ADD COLUMN password TEXT;`); } catch (e) {}
    try { this.db.exec(`ALTER TABLE users ADD COLUMN recovery_code TEXT;`); } catch (e) {}
  }

  async query(text: string, params: any[] = []): Promise<QueryResult> {
    // Convert Postgres-style $1, $2 to SQLite-style ?, ?
    let sqliteQuery = text;
    let paramIndex = 1;
    while (sqliteQuery.includes(`$${paramIndex}`)) {
      sqliteQuery = sqliteQuery.replace(`$${paramIndex}`, '?');
      paramIndex++;
    }

    const stmt = this.db.prepare(sqliteQuery);
    
    if (sqliteQuery.trim().toUpperCase().startsWith('SELECT')) {
      const rows = stmt.all(...params);
      return { rows };
    } else {
      const info = stmt.run(...params);
      return { 
        rows: [], 
        lastInsertRowid: info.lastInsertRowid, 
        changes: info.changes 
      };
    }
  }
}

// --- Postgres Adapter ---
class PostgresAdapter {
  private pool: any;

  async init() {
    try {
      const { Pool } = await import('pg');
      this.pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: process.env.POSTGRES_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
      });

      // Initialize Database Schema
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          google_id TEXT UNIQUE NOT NULL,
          email TEXT NOT NULL,
          name TEXT,
          picture TEXT,
          password TEXT,
          recovery_code TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS habits (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          title TEXT NOT NULL,
          frequency TEXT DEFAULT 'daily',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          archived INTEGER DEFAULT 0,
          FOREIGN KEY (user_id) REFERENCES users (id)
        );
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS completions (
          id SERIAL PRIMARY KEY,
          habit_id INTEGER NOT NULL,
          user_id INTEGER,
          date TEXT NOT NULL,
          status TEXT DEFAULT 'completed',
          completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (habit_id) REFERENCES habits (id),
          FOREIGN KEY (user_id) REFERENCES users (id)
        );
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS milestones (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          status TEXT DEFAULT 'locked',
          x REAL NOT NULL,
          y REAL NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        );
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS milestone_edges (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          from_id INTEGER NOT NULL,
          to_id INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id),
          FOREIGN KEY (from_id) REFERENCES milestones (id) ON DELETE CASCADE,
          FOREIGN KEY (to_id) REFERENCES milestones (id) ON DELETE CASCADE
        );
      `);

      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);`);
      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_completions_user_id_date ON completions(user_id, date);`);
      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_completions_habit_id ON completions(habit_id);`);
      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_milestones_user_id ON milestones(user_id);`);
      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_milestone_edges_user_id ON milestone_edges(user_id);`);

      // Migrations
      try { await this.pool.query(`ALTER TABLE habits ADD COLUMN user_id INTEGER;`); } catch (e) {}
      try { await this.pool.query(`ALTER TABLE completions ADD COLUMN user_id INTEGER;`); } catch (e) {}
      try { await this.pool.query(`ALTER TABLE completions ADD COLUMN status TEXT DEFAULT 'completed';`); } catch (e) {}
      try { await this.pool.query(`ALTER TABLE users ADD COLUMN password TEXT;`); } catch (e) {}
      try { await this.pool.query(`ALTER TABLE users ADD COLUMN recovery_code TEXT;`); } catch (e) {}
    } catch (error) {
      console.error('PostgresAdapter: Initialization failed:', error);
      throw error;
    }
  }

  async query(text: string, params: any[] = []): Promise<QueryResult> {
    try {
      const result = await this.pool.query(text, params);
      
      let lastInsertRowid: number | undefined;
      if (result.rows.length > 0 && (text.toUpperCase().includes('INSERT') || text.toUpperCase().includes('RETURNING'))) {
         lastInsertRowid = result.rows[0].id;
      }

      return {
        rows: result.rows,
        lastInsertRowid,
        changes: result.rowCount || 0
      };
    } catch (error) {
      console.error('PostgresAdapter: Query failed:', { text, params, error });
      throw error;
    }
  }
}

// --- Factory ---
let dbInstance: SQLiteAdapter | PostgresAdapter;

export const getDb = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  if (process.env.POSTGRES_URL) {
    dbInstance = new PostgresAdapter();
    await (dbInstance as PostgresAdapter).init();
  } else {
    if (process.env.VERCEL) {
      console.error('CRITICAL ERROR: Running on Vercel but POSTGRES_URL is not set.');
      console.error('Please go to your Vercel Dashboard -> Storage -> Create Database -> Postgres.');
      throw new Error('Database configuration missing. POSTGRES_URL is required in production.');
    }
    try {
      const { default: Database } = await import('better-sqlite3');
      const db = new Database('habits.db');
      dbInstance = new SQLiteAdapter(db);
    } catch (error) {
      console.error('Failed to initialize SQLite:', error);
      throw error;
    }
  }
  return dbInstance;
};
