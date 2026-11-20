import { config as defaultEnvConfig } from './config/env.js';
import { logger as defaultLogger } from './utils/logger.js';
import { createDatabase, close as closeDb } from './modules/cache/db.js';
import { createCacheRepository } from './modules/cache/cacheRepository.js';
import { createGroqClient } from './modules/analysis/groqClient.js';
import { createBatchAnalyzer } from './modules/analysis/batchAnalyzer.js';
import { createAnalysisService } from './modules/analysis/analysisService.js';
import { createReviewsService } from './modules/reviews/reviews.service.js';
import { createReplyService } from './modules/reviews/reply.service.js';

/**
 * Builds the application dependency injection container.
 *
 * @param {object} overrides
 * @returns {object} Container with wired services and close cleanup function
 */
export function createContainer(overrides = {}) {
  const config = overrides.config ?? defaultEnvConfig;
  const logger = overrides.logger ?? defaultLogger;

  const dbPath = overrides.dbPath ?? (config.NODE_ENV === 'test' ? ':memory:' : config.DB_PATH);
  const db = overrides.db ?? createDatabase(dbPath);
  const cacheRepository = overrides.cacheRepository ?? createCacheRepository(db);

  const groqClient =
    overrides.groqClient ??
    createGroqClient({
      config,
      logger,
      fetchFn: overrides.fetchFn,
      sleep: overrides.sleep,
    });

  const batchAnalyzer =
    overrides.batchAnalyzer ??
    createBatchAnalyzer({
      client: groqClient,
      batchSize: config.BATCH_SIZE,
      logger,
    });

  const analysisService =
    overrides.analysisService ??
    createAnalysisService({
      cacheRepository,
      batchAnalyzer,
      logger,
    });

  const reviewsService =
    overrides.reviewsService ??
    createReviewsService({
      analysisService,
      config,
    });

  const replyService =
    overrides.replyService ??
    createReplyService({
      client: groqClient,
      logger,
    });

  function close() {
    if (db) {
      closeDb(db);
    }
  }

  return {
    config,
    logger,
    db,
    cacheRepository,
    groqClient,
    batchAnalyzer,
    analysisService,
    reviewsService,
    replyService,
    close,
  };
}
