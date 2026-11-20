import { computeCacheKey } from '../cache/cacheRepository.js';

// Status values for analysis results
const ANALYSIS_STATUS = Object.freeze({
  ANALYZED: 'analyzed',
  FAILED: 'analysis_failed',
});

/**
 * Creates an analysis service that wraps batchAnalyzer with an SQLite cache layer.
 *
 * deps:
 *   cacheRepository - { getMany, setMany }
 *   batchAnalyzer   - { analyzeReviews }
 *   logger          - pino-compatible logger (optional)
 *   now             - injectable clock function for testability
 */
export function createAnalysisService({ cacheRepository, batchAnalyzer, logger, now = Date.now }) {
  /**
   * Analyzes an array of cleaned review objects.
   * Only reviews with status 'valid' are sent for analysis.
   * Cache hits are returned directly; only misses are forwarded to the LLM.
   * Newly analyzed successes are written back to the cache.
   * Cache errors are caught and logged (message only); the pipeline continues without cache.
   *
   * Returns all input reviews enriched with:
   *   analysisStatus - 'analyzed' | 'analysis_failed' | 'skipped'
   *   analysis       - the analysis object (only when analyzed)
   *   failureReason  - reason string (only when analysis_failed)
   *   fromCache      - boolean
   */
  async function analyzeReviews(reviews) {
    const startMs = now();

    const validReviews = reviews.filter((r) => r.status === 'valid');

    // Compute cache keys for all valid reviews
    const keyMap = new Map();
    for (const review of validReviews) {
      keyMap.set(review.reviewId, computeCacheKey(review.text));
    }

    // Attempt to fetch cache hits
    let cacheHitMap = new Map();
    let cacheAvailable = true;

    if (cacheRepository) {
      try {
        const keys = Array.from(keyMap.values());
        cacheHitMap = cacheRepository.getMany(keys);
      } catch (cacheErr) {
        cacheAvailable = false;
        if (logger) {
          logger.warn('Cache read failed; proceeding without cache', { message: cacheErr.message });
        }
      }
    }

    // Separate hits from misses
    const missReviews = [];
    for (const review of validReviews) {
      const key = keyMap.get(review.reviewId);
      if (!cacheHitMap.has(key)) {
        missReviews.push(review);
      }
    }

    // Send misses to the LLM batch analyzer
    let analyzerResults = [];
    let analyzerMetrics = { aiCalls: 0, retries: 0, failed: 0, batches: 0 };

    if (missReviews.length > 0) {
      const outcome = await batchAnalyzer.analyzeReviews(missReviews);
      analyzerResults = outcome.results;
      analyzerMetrics = outcome.metrics;
    }

    // Write new successes back to the cache
    if (cacheAvailable && cacheRepository && analyzerResults.length > 0) {
      const toStore = [];
      for (const result of analyzerResults) {
        if (result.status === ANALYSIS_STATUS.ANALYZED) {
          const review = missReviews.find((r) => r.reviewId === result.reviewId);
          if (review) {
            toStore.push({ key: keyMap.get(review.reviewId), analysis: result.analysis });
          }
        }
      }
      if (toStore.length > 0) {
        try {
          cacheRepository.setMany(toStore);
        } catch (cacheErr) {
          if (logger) {
            logger.warn('Cache write failed', { message: cacheErr.message });
          }
        }
      }
    }

    // Build a lookup from reviewId to analyzer result
    const analyzerResultMap = new Map();
    for (const result of analyzerResults) {
      analyzerResultMap.set(result.reviewId, result);
    }

    // Assemble the final enriched review list
    const enriched = reviews.map((review) => {
      if (review.status !== 'valid') {
        return {
          ...review,
          analysisStatus: 'skipped',
          analysis: null,
          failureReason: null,
          fromCache: false,
        };
      }

      const key = keyMap.get(review.reviewId);
      const cached = cacheHitMap.get(key);

      if (cached) {
        return {
          ...review,
          analysisStatus: ANALYSIS_STATUS.ANALYZED,
          analysis: cached,
          failureReason: null,
          fromCache: true,
        };
      }

      const result = analyzerResultMap.get(review.reviewId);
      if (!result) {
        // Should not happen, but guard anyway
        return {
          ...review,
          analysisStatus: ANALYSIS_STATUS.FAILED,
          analysis: null,
          failureReason: 'no result returned',
          fromCache: false,
        };
      }

      if (result.status === ANALYSIS_STATUS.ANALYZED) {
        return {
          ...review,
          analysisStatus: ANALYSIS_STATUS.ANALYZED,
          analysis: result.analysis,
          failureReason: null,
          fromCache: false,
        };
      }

      return {
        ...review,
        analysisStatus: ANALYSIS_STATUS.FAILED,
        analysis: null,
        failureReason: result.reason ?? null,
        fromCache: false,
      };
    });

    const cacheHits = validReviews.length - missReviews.length;
    const durationMs = now() - startMs;

    const metrics = {
      aiCalls: analyzerMetrics.aiCalls,
      cacheHits,
      cacheMisses: missReviews.length,
      retries: analyzerMetrics.retries,
      failed: analyzerMetrics.failed,
      batches: analyzerMetrics.batches,
      durationMs,
    };

    return { reviews: enriched, metrics };
  }

  return { analyzeReviews };
}
