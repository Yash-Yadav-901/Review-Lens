import { parseCsv } from '../cleaning/csvParser.js';
import { cleanReviews } from '../cleaning/reviewCleaner.js';
import { computeInsights } from '../insights/insightsService.js';
import { config as defaultEnvConfig } from '../../config/env.js';

/**
 * Creates reviews service coordinating parsing, cleaning, analysis, and insights.
 *
 * @param {{ analysisService: object, config?: object }} deps
 */
export function createReviewsService({ analysisService, config = defaultEnvConfig }) {
  /**
   * Processes an uploaded CSV buffer or string through the entire ReviewLens pipeline.
   *
   * @param {Buffer | string} input
   * @returns {Promise<{ reviews: object[], report: object, insights: object, metrics: object, parseIssues: object[] }>}
   */
  async function processUpload(input) {
    const { rows, issues: parseIssues } = parseCsv(input);

    const { reviews: cleanedReviews, report } = cleanReviews(rows, {
      maxReviews: config.MAX_REVIEWS,
      maxReviewChars: config.MAX_REVIEW_CHARS,
    });

    const { reviews: analyzedReviews, metrics } =
      await analysisService.analyzeReviews(cleanedReviews);

    const insights = computeInsights(analyzedReviews);

    return {
      reviews: analyzedReviews,
      report,
      insights,
      metrics,
      parseIssues,
    };
  }

  return { processUpload };
}
