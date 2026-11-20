import { fileURLToPath } from 'node:url';
import { dirname, resolve, isAbsolute } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';

// Resolve the server/ directory from this file's location (src/modules/cache -> src/modules -> src -> server)
const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS analysis_cache (
    text_hash   TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

/**
 * Creates and configures a SQLite database.
 * Accepts ':memory:' for in-memory databases (tests).
 * Relative file paths are resolved against the server/ directory.
 * Enables WAL journal mode and a 5-second busy timeout for safe concurrent access.
 */
export function createDatabase(dbPath) {
  let resolvedPath = dbPath;

  if (dbPath !== ':memory:' && !isAbsolute(dbPath)) {
    resolvedPath = resolve(SERVER_DIR, dbPath);
  }

  if (resolvedPath !== ':memory:') {
    // Create parent directory if it does not exist
    const parent = resolve(resolvedPath, '..');
    mkdirSync(parent, { recursive: true });
  }

  const db = new Database(resolvedPath);

  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  db.exec(CREATE_TABLE_SQL);

  return db;
}

/**
 * Closes the database connection.
 * Safe to call even if the database is already closed.
 */
export function close(db) {
  try {
    db.close();
  } catch {
    // Already closed; nothing to do
  }
}
