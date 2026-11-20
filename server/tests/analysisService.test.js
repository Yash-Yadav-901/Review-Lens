import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, close } from '../src/modules/cache/db.js';
import { createCacheRepository } from '../src/modules/cache/cacheRepository.js';
import { createAnalysisService } from '../src/modules/analysis/analysisService.js';

describe('analysisService', () => {
  const sampleAnalysis = {
    sentiment: 'positive',
    topics: ['quality'],
    summary: 'Great build quality',
    needs_reply: false,
  };

  function createMockAnalyzer(behavior = {}) {
    let callCount = 0;
    const calls = [];

    const analyzeReviews = async (reviews) => {
      callCount++;
      calls.push(reviews);

      if (behavior.throws) {
        throw behavior.throws;
      }

      const results = reviews.map((r, i) => {
        if (behavior.failIndices && behavior.failIndices.includes(i)) {
          return {
            reviewId: r.reviewId,
            status: 'analysis_failed',
            reason: 'simulated failure',
          };
        }
        return {
          reviewId: r.reviewId,
          status: 'analyzed',
          analysis: { ...sampleAnalysis, summary: `Analyzed ${r.reviewId}` },
        };
      });

      const failedCount = behavior.failIndices ? behavior.failIndices.length : 0;
      return {
        results,
        metrics: {
          aiCalls: 1,
          retries: 0,
          failed: failedCount,
          batches: 1,
        },
      };
    };

    return { analyzeReviews, getCallCount: () => callCount, getCalls: () => calls };
  }

  it('first run sends all valid reviews to analyzer and caches them; second run uses cache with 0 analyzer calls', async () => {
    const db = createDatabase(':memory:');
    const cacheRepository = createCacheRepository(db);
    const analyzer = createMockAnalyzer();

    let clock = 1000;
    const service = createAnalysisService({
      cacheRepository,
      batchAnalyzer: analyzer,
      now: () => clock++,
    });

    const reviews = [
      { reviewId: 'R1', text: 'Text 1', status: 'valid' },
      { reviewId: 'R2', text: 'Text 2', status: 'valid' },
      { reviewId: 'R3', text: 'Text 3', status: 'valid' },
    ];

    // First run (Cold cache)
    const run1 = await service.analyzeReviews(reviews);
    assert.equal(analyzer.getCallCount(), 1);
    assert.equal(run1.metrics.aiCalls, 1);
    assert.equal(run1.metrics.cacheHits, 0);
    assert.equal(run1.metrics.cacheMisses, 3);
    assert.equal(run1.reviews[0].fromCache, false);
    assert.equal(run1.reviews[0].analysisStatus, 'analyzed');

    // Second run (Warm cache)
    const run2 = await service.analyzeReviews(reviews);
    assert.equal(analyzer.getCallCount(), 1, 'Analyzer should not have been called on run 2');
    assert.equal(run2.metrics.aiCalls, 0);
    assert.equal(run2.metrics.cacheHits, 3);
    assert.equal(run2.metrics.cacheMisses, 0);
    assert.equal(run2.reviews[0].fromCache, true);
    assert.equal(run2.reviews[0].analysisStatus, 'analyzed');

    close(db);
  });

  it('sends only cache misses to the analyzer on partial cache', async () => {
    const db = createDatabase(':memory:');
    const cacheRepository = createCacheRepository(db);
    const analyzer = createMockAnalyzer();

    const service = createAnalysisService({
      cacheRepository,
      batchAnalyzer: analyzer,
    });

    const reviewsInitial = [{ reviewId: 'R1', text: 'Text 1', status: 'valid' }];
    await service.analyzeReviews(reviewsInitial);
    assert.equal(analyzer.getCallCount(), 1);

    // Now analyze R1 and new R2
    const reviewsSecond = [
      { reviewId: 'R1', text: 'Text 1', status: 'valid' },
      { reviewId: 'R2', text: 'Text 2', status: 'valid' },
    ];
    const res = await service.analyzeReviews(reviewsSecond);
    assert.equal(analyzer.getCallCount(), 2);
    // Only R2 was sent to analyzer in call 2
    assert.equal(analyzer.getCalls()[1].length, 1);
    assert.equal(analyzer.getCalls()[1][0].reviewId, 'R2');

    assert.equal(res.metrics.cacheHits, 1);
    assert.equal(res.metrics.cacheMisses, 1);
    assert.equal(res.reviews.find((r) => r.reviewId === 'R1').fromCache, true);
    assert.equal(res.reviews.find((r) => r.reviewId === 'R2').fromCache, false);

    close(db);
  });

  it('never stores analysis_failed in cache and retries it on next run', async () => {
    const db = createDatabase(':memory:');
    const cacheRepository = createCacheRepository(db);
    const analyzer = createMockAnalyzer({ failIndices: [0] });

    const service = createAnalysisService({
      cacheRepository,
      batchAnalyzer: analyzer,
    });

    const reviews = [{ reviewId: 'R1', text: 'Failing review', status: 'valid' }];

    const res1 = await service.analyzeReviews(reviews);
    assert.equal(res1.reviews[0].analysisStatus, 'analysis_failed');
    assert.equal(res1.metrics.failed, 1);

    // Next run should attempt again
    const res2 = await service.analyzeReviews(reviews);
    assert.equal(analyzer.getCallCount(), 2, 'Failing review must be re-sent to analyzer');
    assert.equal(res2.metrics.cacheMisses, 1);
    assert.equal(res2.metrics.cacheHits, 0);

    close(db);
  });

  it('duplicate and skipped_empty reviews are never sent to analyzer', async () => {
    const db = createDatabase(':memory:');
    const cacheRepository = createCacheRepository(db);
    const analyzer = createMockAnalyzer();

    const service = createAnalysisService({
      cacheRepository,
      batchAnalyzer: analyzer,
    });

    const reviews = [
      { reviewId: 'R1', text: 'Valid review', status: 'valid' },
      { reviewId: 'R2', text: 'Dup', status: 'duplicate', duplicateOf: 'R1' },
      { reviewId: 'R3', text: '', status: 'skipped_empty' },
    ];

    const res = await service.analyzeReviews(reviews);
    assert.equal(analyzer.getCallCount(), 1);
    assert.equal(analyzer.getCalls()[0].length, 1);
    assert.equal(analyzer.getCalls()[0][0].reviewId, 'R1');

    assert.equal(res.reviews[1].analysisStatus, 'skipped');
    assert.equal(res.reviews[2].analysisStatus, 'skipped');

    close(db);
  });

  it('continues without cache if cache repository throws an error', async () => {
    const brokenCache = {
      getMany: () => {
        throw new Error('Database locked');
      },
      setMany: () => {
        throw new Error('Database locked');
      },
    };

    const analyzer = createMockAnalyzer();
    const service = createAnalysisService({
      cacheRepository: brokenCache,
      batchAnalyzer: analyzer,
    });

    const reviews = [{ reviewId: 'R1', text: 'Text', status: 'valid' }];
    const res = await service.analyzeReviews(reviews);

    assert.equal(res.reviews[0].analysisStatus, 'analyzed');
    assert.equal(res.reviews[0].fromCache, false);
    assert.equal(res.metrics.cacheHits, 0);
    assert.equal(res.metrics.cacheMisses, 1);
  });
});
