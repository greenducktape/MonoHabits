import Database from 'better-sqlite3';
const db = new Database('habits.db');
try {
  const habits = db.prepare('SELECT * FROM habits').all();
  console.log('Habits in DB:', habits);
  const completions = db.prepare('SELECT * FROM completions').all();
  console.log('Completions in DB:', completions);
} catch (e) {
  console.error('Error reading DB:', e);
}
