import Database from 'better-sqlite3';
import path from 'path';

let db: ReturnType<typeof Database>;

try {
  db = new Database(path.join(process.cwd(), 'local.db'));
} catch (err) {
  throw new Error(`BSVibes DB: failed to open local.db — ${err instanceof Error ? err.message : String(err)}`);
}

try {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      author_name TEXT NOT NULL,
      signature TEXT,
      pubkey TEXT,
      tx_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bootboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      boosted_by TEXT NOT NULL,
      booted_at TEXT NOT NULL DEFAULT (datetime('now')),
      held_until TEXT,
      FOREIGN KEY (post_id) REFERENCES posts(id)
    )
  `);

  // Migrate: add columns if they don't exist yet
  const columns = db.prepare("PRAGMA table_info(posts)").all() as { name: string }[];
  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('signature')) {
    db.exec('ALTER TABLE posts ADD COLUMN signature TEXT');
  }
  if (!columnNames.includes('pubkey')) {
    db.exec('ALTER TABLE posts ADD COLUMN pubkey TEXT');
  }
} catch (err) {
  throw new Error(`BSVibes DB: failed during schema init — ${err instanceof Error ? err.message : String(err)}`);
}

export { db };
