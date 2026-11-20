import { createHash } from 'node:crypto';
import { normalizeText } from '../cleaning/reviewCleaner.js';
import { PROMPT_VERSION } from '../analysis/promptBuilder.js';
import { validateItems } from '../analysis/analysisSchema.js';

// SQLite default maximum number of bound variables in a single query
const SQLITE_VAR_LIMIT = 999;

/**
 * Computes a stable cache key: sha256 of PROMPT_VERSION + newline + normalizeText(text).
 * Changing PROMPT_VERSION automatically invalidates all prior cache entries.
 */
export function computeCacheKey(text) {
  const payload = `${PROMPT_VERSION}\n${normalizeText(text)}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Creates a cache repository backed by the given better-sqlite3 database instance.
 *
 * getMany(keys)   - Returns a Map<key, analysis> for every key that has a valid cached entry.
 *                   Invalid JSON or schema failures are treated as cache misses (the row is ignored).
 *                   analysis_failed status is never returned.
 *
 * setMany(entries) - Persists { key, analysis } pairs in a single transaction using
 *                    INSERT OR REPLACE. Never stores analysis_failed entries.
 */
export function createCacheRepository(db) {
  /**
   * Splits an array into chunks of at most `size` elements.
   */
  function chunk(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  function getMany(keys) {
    const resultMap = new Map();
    if (!keys || keys.length === 0) {
      return resultMap;
    }

    // Chunk queries to stay within the SQLite variable limit
    for (const keyChunk of chunk(keys, SQLITE_VAR_LIMIT)) {
      const placeholders = keyChunk.map(() => '?').join(', ');
      const rows = db
        .prepare(
          `SELECT text_hash, result_json FROM analysis_cache WHERE text_hash IN (${placeholders})`,
        )
        .all(...keyChunk);

      for (const row of rows) {
        let parsed;
        try {
          parsed = JSON.parse(row.result_json);
        } catch {
          // Corrupted JSON: treat as miss
          continue;
        }

        // Validate the stored analysis against the current schema
        const validation = validateItems([parsed], 1);
        if (!validation[0].ok) {
          // Schema mismatch (e.g. prompt version changed data shape): treat as miss
          continue;
        }

        resultMap.set(row.text_hash, validation[0].analysis);
      }
    }

    return resultMap;
  }

  function setMany(entries) {
    if (!entries || entries.length === 0) {
      return;
    }

    const insert = db.prepare(
      'INSERT OR REPLACE INTO analysis_cache (text_hash, result_json) VALUES (?, ?)',
    );

    const insertAll = db.transaction((items) => {
      for (const { key, analysis } of items) {
        insert.run(key, JSON.stringify(analysis));
      }
    });

    insertAll(entries);
  }

  return { getMany, setMany };
}
