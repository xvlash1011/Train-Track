import Database from 'better-sqlite3';
try {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
  console.log('better-sqlite3 is working!');
} catch (e) {
  console.error('better-sqlite3 failed:', e);
}
