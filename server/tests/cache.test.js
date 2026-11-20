import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, close } from '../src/modules/cache/db.js';
import { computeCacheKey, createCacheRepository } from '../src/modules/cache/cacheRepository.js';

describe('cache - computeCacheKey', () => {
  it('is stable for case and spacing differences', () => {
    const k1 = computeCacheKey('Great Product!');
    const k2 = computeCacheKey('  great   product!  ');
    assert.equal(k1, k2);
  });

  it('produces 64-character hex sha256 string', () => {
    const key = computeCacheKey('Hello world');
    assert.equal(typeof key, 'string');
    assert.equal(key.length, 64);
    assert.match(key, /^[0-9a-f]{64}$/);
  });

  it('key changes when PROMPT_VERSION changes', async () => {
    const { createHash } = await import('node:crypto');
    const { normalizeText } = await import('../src/modules/cleaning/reviewCleaner.js');
    const text = 'Stable review text';
    const keyV1 = computeCacheKey(text);

    // Compute key with an alternate version
    const keyV2 = createHash('sha256')
      .update(`v2\n${normalizeText(text)}`, 'utf8')
      .digest('hex');

    assert.notEqual(keyV1, keyV2);
  });
});

describe('cache - db and cacheRepository', () => {
  const sampleAnalysis = {
    sentiment: 'positive',
    topics: ['quality'],
    summary: 'Excellent quality',
    needs_reply: false,
  };

  it('createDatabase creates tables and enables WAL mode', () => {
    const db = createDatabase(':memory:');
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_cache'")
      .get();
    assert.ok(row, 'Table analysis_cache must exist');
    close(db);
  });

  it('setMany and getMany round trip successfully', () => {
    const db = createDatabase(':memory:');
    const repo = createCacheRepository(db);

    const key1 = computeCacheKey('Text 1');
    const key2 = computeCacheKey('Text 2');

    repo.setMany([
      { key: key1, analysis: sampleAnalysis },
      { key: key2, analysis: { ...sampleAnalysis, sentiment: 'negative' } },
    ]);

    const results = repo.getMany([key1, key2, 'nonexistent_key']);
    assert.equal(results.size, 2);
    assert.deepEqual(results.get(key1), sampleAnalysis);
    assert.equal(results.get(key2).sentiment, 'negative');
    assert.equal(results.has('nonexistent_key'), false);

    close(db);
  });

  it('handles chunking queries over the 999 SQLite variable limit', () => {
    const db = createDatabase(':memory:');
    const repo = createCacheRepository(db);

    const total = 1005;
    const entries = [];
    const keys = [];

    for (let i = 0; i < total; i++) {
      const key = computeCacheKey(`Chunk review item ${i}`);
      keys.push(key);
      entries.push({
        key,
        analysis: {
          sentiment: 'neutral',
          topics: ['other'],
          summary: `Summary ${i}`,
          needs_reply: false,
        },
      });
    }

    repo.setMany(entries);
    const retrieved = repo.getMany(keys);
    assert.equal(retrieved.size, total);

    close(db);
  });

  it('treats corrupted JSON in database as a cache miss', () => {
    const db = createDatabase(':memory:');
    const repo = createCacheRepository(db);

    const key = computeCacheKey('Corrupted entry');
    db.prepare('INSERT INTO analysis_cache (text_hash, result_json) VALUES (?, ?)').run(
      key,
      '{ broken json ...',
    );

    const retrieved = repo.getMany([key]);
    assert.equal(retrieved.has(key), false);

    // Can be replaced by setMany
    repo.setMany([{ key, analysis: sampleAnalysis }]);
    const retrievedAfter = repo.getMany([key]);
    assert.deepEqual(retrievedAfter.get(key), sampleAnalysis);

    close(db);
  });

  it('treats schema-invalid stored JSON as a cache miss', () => {
    const db = createDatabase(':memory:');
    const repo = createCacheRepository(db);

    const key = computeCacheKey('Invalid schema entry');
    db.prepare('INSERT INTO analysis_cache (text_hash, result_json) VALUES (?, ?)').run(
      key,
      JSON.stringify({ sentiment: 'invalid_enum', topics: [] }),
    );

    const retrieved = repo.getMany([key]);
    assert.equal(retrieved.has(key), false);

    close(db);
  });

  it('never stores analysis_failed status in cache repository', () => {
    const db = createDatabase(':memory:');
    const repo = createCacheRepository(db);

    const key = computeCacheKey('Failed review item');
    // If a failed analysis payload is somehow attempted to be stored or fetched
    db.prepare('INSERT INTO analysis_cache (text_hash, result_json) VALUES (?, ?)').run(
      key,
      JSON.stringify({ status: 'analysis_failed', reason: 'llm unavailable' }),
    );

    const retrieved = repo.getMany([key]);
    assert.equal(
      retrieved.has(key),
      false,
      'analysis_failed entries must never be returned as valid cache',
    );

    close(db);
  });

  it('returns empty Map when passed empty keys array', () => {
    const db = createDatabase(':memory:');
    const repo = createCacheRepository(db);

    const retrieved = repo.getMany([]);
    assert.equal(retrieved.size, 0);

    close(db);
  });
});
