import { getDb } from './src/db.ts';

async function test() {
  try {
    const db = await getDb();
    console.log('DB initialized successfully');
    const result = await db.query(
      'INSERT INTO users (google_id, email, password) VALUES ($1, $2, $3) RETURNING id', 
      ['test:123', 'test@example.com', 'password']
    );
    console.log('Insert successful:', result);
  } catch (err) {
    console.error('DB query failed:', err);
  }
}

test();
