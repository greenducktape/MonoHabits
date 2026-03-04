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
    const { sql } = await import('@vercel/postgres');
    this.sql = sql;

    // Initialize Database Schema
    // Note: In Postgres, we use SERIAL for auto-increment and specific types
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
  }

  async query(text: string, params: any[] = []): Promise<QueryResult> {
    // Vercel Postgres uses template literals or parameterized queries
    // We need to be careful here. The `sql` tag function expects a template literal.
    // However, the `client.query` method accepts text and params.
    // We'll use the underlying client for raw queries to support dynamic SQL.
    
    // Note: @vercel/postgres `sql` is a tagged template literal.
    // To execute a raw query string with parameters, we can use `db.query`.
    // But `db` isn't directly exported, `sql` is.
    // We can use `sql.query(text, params)`.
    
    const result = await this.sql.query(text, params);
    
    // Normalize result
    // Postgres returns rows. Insert/Update returns rowCount.
    // To get lastInsertId in Postgres, we usually need `RETURNING id`.
    // Our app expects `lastInsertRowid`.
    // We will need to adjust our INSERT queries to include `RETURNING id`.
    
    let lastInsertRowid: number | undefined;
    if (result.rows.length > 0 && (text.toUpperCase().includes('INSERT') || text.toUpperCase().includes('RETURNING'))) {
       lastInsertRowid = result.rows[0].id;
    }

    return {
      rows: result.rows,
      lastInsertRowid,
      changes: result.rowCount || 0
    };
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
