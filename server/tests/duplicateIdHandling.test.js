import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, close } from '../src/modules/cache/db.js';
import { createCacheRepository } from '../src/modules/cache/cacheRepository.js';
import { createAnalysisService } from '../src/modules/analysis/analysisService.js';
import { createBatchAnalyzer } from '../src/modules/analysis/batchAnalyzer.js';
import { createReviewsService } from '../src/modules/reviews/reviews.service.js';

describe('duplicate reviewId handling and rowNumber stability', () => {
  it('assigns unique rowNumbers and independent analyses when two rows share the same review_id', async () => {
    const csvContent = [
      'review_id,product,rating,date,review_text',
      'N01,Phone,5,2024-01-01,Love this battery life',
      'N01,Phone,1,2024-01-02,Terrible audio speaker is broken',
      'N02,Phone,5,2024-01-03,Love this battery life',
    ].join('\n');

    const db = createDatabase(':memory:');
    const cacheRepository = createCacheRepository(db);

    const mockClient = {
      async chat({ user }) {
        const parsed = JSON.parse(user);
        const results = parsed.map((item) => {
          if (item.text.includes('battery')) {
            return {
              sentiment: 'positive',
              topics: ['quality'],
              summary: 'Battery summary',
              needs_reply: false,
            };
          }
          return {
            sentiment: 'negative',
            topics: ['other'],
            summary: 'Broken speaker summary',
            needs_reply: true,
          };
        });
        return {
          content: JSON.stringify({ results }),
          finishReason: 'stop',
          retries: 0,
        };
      },
    };

    const batchAnalyzer = createBatchAnalyzer({ client: mockClient, batchSize: 5 });
    const analysisService = createAnalysisService({ cacheRepository, batchAnalyzer });
    const reviewsService = createReviewsService({ analysisService });

    const result = await reviewsService.processUpload(csvContent);

    // 1. Verify row numbers are 1-based, unique, and present on all rows
    assert.equal(result.reviews.length, 3);
    assert.equal(result.reviews[0].rowNumber, 1);
    assert.equal(result.reviews[1].rowNumber, 2);
    assert.equal(result.reviews[2].rowNumber, 3);

    const rowNumbers = result.reviews.map((r) => r.rowNumber);
    const uniqueRowNumbers = new Set(rowNumbers);
    assert.equal(uniqueRowNumbers.size, 3, 'Every review must have a unique rowNumber');

    // 2. Both rows share reviewId 'N01', but get their own independent analysis
    assert.equal(result.reviews[0].reviewId, 'N01');
    assert.equal(result.reviews[1].reviewId, 'N01');

    assert.equal(result.reviews[0].status, 'valid');
    assert.equal(result.reviews[0].analysis.sentiment, 'positive');
    assert.equal(result.reviews[0].analysis.summary, 'Battery summary');

    assert.equal(result.reviews[1].status, 'valid');
    assert.equal(result.reviews[1].analysis.sentiment, 'negative');
    assert.equal(result.reviews[1].analysis.summary, 'Broken speaker summary');

    // 3. Duplicate row reference points to the right row number and ID
    assert.equal(result.reviews[2].status, 'duplicate');
    assert.equal(result.reviews[2].duplicateOf, 'N01');
    assert.equal(result.reviews[2].duplicateOfRow, 1);

    // 4. Insights examples do not mix up summaries
    const praise = result.insights.topPraises.find((p) => p.topic === 'quality');
    assert.ok(praise);
    assert.deepEqual(praise.examples, ['Battery summary']);

    const complaint = result.insights.topComplaints.find((c) => c.topic === 'other');
    assert.ok(complaint);
    assert.deepEqual(complaint.examples, ['Broken speaker summary']);

    close(db);
  });

  it('keeps mismatches separated with rowNumber when rows share reviewId', async () => {
    // Both rows have mismatch between rating and sentiment
    // Row 1: rating 1 but positive sentiment
    // Row 2: rating 5 but negative sentiment
    const csvContent = [
      'review_id,product,rating,date,review_text',
      'SAME_ID,Gadget,1,2024-01-01,Actually wonderful product',
      'SAME_ID,Gadget,5,2024-01-02,Actually horrible product',
    ].join('\n');

    const db = createDatabase(':memory:');
    const cacheRepository = createCacheRepository(db);

    const mockClient = {
      async chat({ user }) {
        const parsed = JSON.parse(user);
        const results = parsed.map((item) => {
          if (item.text.includes('wonderful')) {
            return {
              sentiment: 'positive',
              topics: ['quality'],
              summary: 'Wonderful gadget',
              needs_reply: false,
            };
          }
          return {
            sentiment: 'negative',
            topics: ['quality'],
            summary: 'Horrible gadget',
            needs_reply: true,
          };
        });
        return {
          content: JSON.stringify({ results }),
          finishReason: 'stop',
          retries: 0,
        };
      },
    };

    const batchAnalyzer = createBatchAnalyzer({ client: mockClient, batchSize: 5 });
    const analysisService = createAnalysisService({ cacheRepository, batchAnalyzer });
    const reviewsService = createReviewsService({ analysisService });

    const result = await reviewsService.processUpload(csvContent);

    assert.equal(result.insights.ratingAgreement.mismatches.length, 2);

    const m1 = result.insights.ratingAgreement.mismatches[0];
    const m2 = result.insights.ratingAgreement.mismatches[1];

    assert.equal(m1.rowNumber, 1);
    assert.equal(m1.reviewId, 'SAME_ID');
    assert.equal(m1.rating, 1);
    assert.equal(m1.sentiment, 'positive');

    assert.equal(m2.rowNumber, 2);
    assert.equal(m2.reviewId, 'SAME_ID');
    assert.equal(m2.rating, 5);
    assert.equal(m2.sentiment, 'negative');

    close(db);
  });
});
