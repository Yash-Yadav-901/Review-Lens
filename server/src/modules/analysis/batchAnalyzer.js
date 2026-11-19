import { parseModelContent, validateItems } from './analysisSchema.js';
import { buildAnalysisMessages } from './promptBuilder.js';
import { ExternalServiceError } from '../../utils/AppError.js';

/**
 * Creates batch analyzer to run sequential batches of reviews through Groq LLM.
 */
export function createBatchAnalyzer({ client, batchSize = 5, logger }) {
  async function analyzeReviews(reviews) {
    const results = new Array(reviews.length);
    const metrics = {
      aiCalls: 0,
      retries: 0,
      failed: 0,
      batches: Math.ceil(reviews.length / batchSize) || 0,
    };

    for (let i = 0; i < reviews.length; i += batchSize) {
      const batchReviews = reviews.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize) + 1;

      if (logger) {
        logger.info('Analyzing review batch', {
          batch: batchIndex,
          size: batchReviews.length,
        });
      }

      // Step 1: Execute primary call
      let primaryOutcome;
      try {
        metrics.aiCalls++;
        const messages = buildAnalysisMessages(batchReviews);
        const chatRes = await client.chat(messages);
        metrics.retries += chatRes.retries || 0;

        if (chatRes.finishReason === 'length') {
          primaryOutcome = { ok: false, reason: 'finish_reason length' };
        } else {
          const rawItems = parseModelContent(chatRes.content);
          const validation = validateItems(rawItems, batchReviews.length);
          primaryOutcome = { ok: true, validation };
        }
      } catch (err) {
        if (err instanceof ExternalServiceError) {
          if (!err.details?.retryable) {
            // Non-retryable error (e.g. LLM_AUTH_FAILED, LLM_BAD_REQUEST): stop immediately
            throw err;
          }
          // Retryable error that exhausted all retries
          for (let b = 0; b < batchReviews.length; b++) {
            results[i + b] = {
              reviewId: batchReviews[b].reviewId,
              status: 'analysis_failed',
              reason: 'llm unavailable',
            };
          }
          metrics.failed += batchReviews.length;
          continue;
        }

        // ModelOutputError or unexpected JSON failure
        primaryOutcome = {
          ok: false,
          reason: err.reason || err.message || 'invalid model output',
        };
      }

      // Identify which items passed and which failed in this batch
      const passingIndices = [];
      const failingIndices = [];

      if (primaryOutcome.ok) {
        for (let b = 0; b < batchReviews.length; b++) {
          const v = primaryOutcome.validation[b];
          if (v && v.ok) {
            passingIndices.push({ batchPos: b, analysis: v.analysis });
          } else {
            failingIndices.push({
              batchPos: b,
              reason: v?.reason || 'validation failed',
            });
          }
        }
      } else {
        for (let b = 0; b < batchReviews.length; b++) {
          failingIndices.push({
            batchPos: b,
            reason: primaryOutcome.reason,
          });
        }
      }

      // Record successful primary items
      for (const p of passingIndices) {
        results[i + p.batchPos] = {
          reviewId: batchReviews[p.batchPos].reviewId,
          status: 'analyzed',
          analysis: p.analysis,
        };
      }

      // If no items failed, move to next batch
      if (failingIndices.length === 0) {
        continue;
      }

      // Step 2: One-time re-ask for failed reviews only
      const reaskReviews = failingIndices.map((f) => batchReviews[f.batchPos]);
      try {
        metrics.aiCalls++;
        const reaskMessages = buildAnalysisMessages(reaskReviews);
        const reaskRes = await client.chat(reaskMessages);
        metrics.retries += reaskRes.retries || 0;

        if (reaskRes.finishReason === 'length') {
          for (const f of failingIndices) {
            results[i + f.batchPos] = {
              reviewId: batchReviews[f.batchPos].reviewId,
              status: 'analysis_failed',
              reason: 'finish_reason length',
            };
            metrics.failed++;
          }
        } else {
          const rawItems = parseModelContent(reaskRes.content);
          const reaskValidation = validateItems(rawItems, reaskReviews.length);

          for (let r = 0; r < failingIndices.length; r++) {
            const f = failingIndices[r];
            const v = reaskValidation[r];
            if (v && v.ok) {
              results[i + f.batchPos] = {
                reviewId: batchReviews[f.batchPos].reviewId,
                status: 'analyzed',
                analysis: v.analysis,
              };
            } else {
              results[i + f.batchPos] = {
                reviewId: batchReviews[f.batchPos].reviewId,
                status: 'analysis_failed',
                reason: v?.reason || 're-ask validation failed',
              };
              metrics.failed++;
            }
          }
        }
      } catch (err) {
        if (err instanceof ExternalServiceError && !err.details?.retryable) {
          throw err;
        }

        const reason =
          err instanceof ExternalServiceError ? 'llm unavailable' : err.reason || 're-ask failed';

        for (const f of failingIndices) {
          results[i + f.batchPos] = {
            reviewId: batchReviews[f.batchPos].reviewId,
            status: 'analysis_failed',
            reason,
          };
          metrics.failed++;
        }
      }
    }

    if (logger) {
      logger.info('Completed batch analysis', {
        total: reviews.length,
        failed: metrics.failed,
        aiCalls: metrics.aiCalls,
      });
    }

    return { results, metrics };
  }

  return { analyzeReviews };
}
