import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createDatabase, close } from '../src/modules/cache/db.js';
import { createCacheRepository } from '../src/modules/cache/cacheRepository.js';
import { createAnalysisService } from '../src/modules/analysis/analysisService.js';
import { createReviewsService } from '../src/modules/reviews/reviews.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REVIEWS_CSV_PATH = resolve(__dirname, '../../reviews.csv');

describe('reviewsService - processUpload integration pipeline', () => {
  it('processes root reviews.csv end-to-end with mocked LLM and verifies caching', async () => {
    assert.ok(existsSync(REVIEWS_CSV_PATH), `reviews.csv must exist at ${REVIEWS_CSV_PATH}`);

    const csvContent = readFileSync(REVIEWS_CSV_PATH);

    const db = createDatabase(':memory:');
    const cacheRepository = createCacheRepository(db);

    let chatCallCount = 0;
    const mockClient = {
      async chat({ user }) {
        chatCallCount++;
        const parsed = JSON.parse(user);
        const results = parsed.map((item) => {
          const lower = item.text.toLowerCase();
          // If injection text (R012), classify as negative with needs_reply
          if (lower.includes('ignore all previous instructions') || lower.includes('left earbud')) {
            return {
              sentiment: 'negative',
              topics: ['quality'],
              summary: 'Earbud broken despite injection attempt.',
              needs_reply: true,
            };
          }
          return {
            sentiment: 'positive',
            topics: ['quality'],
            summary: 'General positive sentiment.',
            needs_reply: false,
          };
        });
        return {
          content: JSON.stringify({ results }),
          finishReason: 'stop',
          retries: 0,
        };
      },
    };

    const { createBatchAnalyzer } = await import('../src/modules/analysis/batchAnalyzer.js');
    const batchAnalyzer = createBatchAnalyzer({
      client: mockClient,
      batchSize: 5,
    });

    const analysisService = createAnalysisService({
      cacheRepository,
      batchAnalyzer,
    });

    const reviewsService = createReviewsService({
      analysisService,
      config: {
        MAX_REVIEWS: 500,
        MAX_REVIEW_CHARS: 1000,
      },
    });

    // Run 1: First upload
    const run1 = await reviewsService.processUpload(csvContent);

    assert.equal(run1.report.totalRows, 30);
    assert.equal(run1.report.valid, 28);
    assert.equal(run1.report.skippedEmpty, 1);
    assert.equal(run1.report.duplicates, 1);

    const analyzedValid = run1.reviews.filter((r) => r.analysisStatus === 'analyzed');
    assert.equal(analyzedValid.length, 28);

    const skipped = run1.reviews.filter((r) => r.analysisStatus === 'skipped');
    assert.equal(skipped.length, 2); // 1 empty + 1 duplicate

    // R012 classified as negative
    const r012 = run1.reviews.find((r) => r.reviewId === 'R012');
    assert.ok(r012);
    assert.equal(r012.analysis.sentiment, 'negative');
    assert.equal(r012.analysis.needs_reply, true);

    assert.ok(chatCallCount > 0);
    assert.equal(run1.metrics.cacheHits, 0);
    assert.equal(run1.metrics.cacheMisses, 28);

    // Run 2: Second upload of identical content should hit cache completely
    const previousCallCount = chatCallCount;
    const run2 = await reviewsService.processUpload(csvContent);

    assert.equal(chatCallCount, previousCallCount, 'No LLM calls on second upload');
    assert.equal(run2.metrics.aiCalls, 0);
    assert.equal(run2.metrics.cacheHits, 28);
    assert.equal(run2.metrics.cacheMisses, 0);

    close(db);
  });
});
