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
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (habit_id) REFERENCES habits (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      );
    `);

    // Migrations
    try { this.db.exec(`ALTER TABLE habits ADD COLUMN user_id INTEGER;`); } catch (e) {}
    try { this.db.exec(`ALTER TABLE completions ADD COLUMN user_id INTEGER;`); } catch (e) {}
    try { this.db.exec(`ALTER TABLE users ADD COLUMN password TEXT;`); } catch (e) {}
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

// --- Postgres Adapter (Vercel) ---
class PostgresAdapter {
  private sql: any;

  async init() {
    try {
      console.log('PostgresAdapter: Importing @vercel/postgres...');
      const { sql } = await import('@vercel/postgres');
      this.sql = sql;
      console.log('PostgresAdapter: @vercel/postgres imported.');

      // Initialize Database Schema
      console.log('PostgresAdapter: Initializing schema...');
      await this.sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          google_id TEXT UNIQUE NOT NULL,
          email TEXT NOT NULL,
          name TEXT,
          picture TEXT,
          password TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      
      await this.sql`
        CREATE TABLE IF NOT EXISTS habits (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          title TEXT NOT NULL,
          frequency TEXT DEFAULT 'daily',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          archived INTEGER DEFAULT 0,
          FOREIGN KEY (user_id) REFERENCES users (id)
        );
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS completions (
          id SERIAL PRIMARY KEY,
          habit_id INTEGER NOT NULL,
          user_id INTEGER,
          date TEXT NOT NULL,
          completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (habit_id) REFERENCES habits (id),
          FOREIGN KEY (user_id) REFERENCES users (id)
        );
      `;
      console.log('PostgresAdapter: Schema initialized.');
    } catch (error) {
      console.error('PostgresAdapter: Initialization failed:', error);
      throw error;
    }
  }

  async query(text: string, params: any[] = []): Promise<QueryResult> {
    try {
      const result = await this.sql.query(text, params);
      
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
  console.log('getDb: Called');
  if (dbInstance) {
    console.log('getDb: Returning existing instance');
    return dbInstance;
  }

  if (process.env.POSTGRES_URL) {
    console.log('Using Vercel Postgres');
    dbInstance = new PostgresAdapter();
    await (dbInstance as PostgresAdapter).init();
  } else {
    console.log('Using Local SQLite');
    try {
      console.log('Importing better-sqlite3...');
      const { default: Database } = await import('better-sqlite3');
      console.log('better-sqlite3 imported. Connecting to habits.db...');
      const db = new Database('habits.db');
      console.log('Connected to habits.db. Initializing adapter...');
      dbInstance = new SQLiteAdapter(db);
      console.log('SQLite adapter initialized.');
    } catch (error) {
      console.error('Failed to initialize SQLite:', error);
      throw error;
    }
  }
  return dbInstance;
};
