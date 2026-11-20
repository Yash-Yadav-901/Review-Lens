import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeInsights } from '../src/modules/insights/insightsService.js';

describe('insightsService', () => {
  it('handles empty input gracefully', () => {
    const insights = computeInsights([]);
    assert.equal(insights.summary.totalAnalyzed, 0);
    assert.equal(insights.summary.positive.count, 0);
    assert.equal(insights.summary.positive.pct, 0);
    assert.equal(insights.summary.failedCount, 0);
    assert.equal(insights.topComplaints.length, 0);
    assert.equal(insights.topPraises.length, 0);
    assert.equal(insights.byProduct.length, 0);
    assert.equal(insights.ratingAgreement.comparedCount, 0);
    assert.equal(insights.ratingAgreement.agreementPercent, 100);
  });

  it('computes sentiment percentages, counts, and rating agreements accurately', () => {
    const input = [
      {
        reviewId: 'R1',
        product: 'Widget',
        rating: 5,
        status: 'valid',
        analysisStatus: 'analyzed',
        analysis: {
          sentiment: 'positive',
          topics: ['quality'],
          summary: 'High quality build',
          needs_reply: false,
        },
      },
      {
        reviewId: 'R2',
        product: 'Widget',
        rating: 4,
        status: 'valid',
        analysisStatus: 'analyzed',
        analysis: {
          sentiment: 'positive',
          topics: ['price'],
          summary: 'Good value for money',
          needs_reply: false,
        },
      },
      {
        reviewId: 'R3',
        product: 'Gadget',
        rating: 1,
        status: 'valid',
        analysisStatus: 'analyzed',
        analysis: {
          sentiment: 'negative',
          topics: ['delivery'],
          summary: 'Shipping was delayed',
          needs_reply: true,
        },
      },
      {
        reviewId: 'R4',
        product: 'Gadget',
        rating: 3,
        status: 'valid',
        analysisStatus: 'analyzed',
        analysis: {
          sentiment: 'neutral',
          topics: ['other'],
          summary: 'Average product',
          needs_reply: false,
        },
      },
      // Review with mismatch: rating 5 (positive expected) but labeled negative
      {
        reviewId: 'R5',
        product: 'Gadget',
        rating: 5,
        status: 'valid',
        analysisStatus: 'analyzed',
        analysis: {
          sentiment: 'negative',
          topics: ['quality'],
          summary: 'Handles broke off',
          needs_reply: true,
        },
      },
      // Review with null rating
      {
        reviewId: 'R6',
        product: 'Widget',
        rating: null,
        status: 'valid',
        analysisStatus: 'analyzed',
        analysis: {
          sentiment: 'positive',
          topics: ['quality'],
          summary: 'Nice product',
          needs_reply: false,
        },
      },
      // Excluded items: duplicate, skipped_empty, failed
      {
        reviewId: 'R7',
        status: 'duplicate',
        analysisStatus: 'skipped',
      },
      {
        reviewId: 'R8',
        status: 'skipped_empty',
        analysisStatus: 'skipped',
      },
      {
        reviewId: 'R9',
        status: 'valid',
        analysisStatus: 'analysis_failed',
      },
    ];

    const insights = computeInsights(input);

    assert.equal(insights.summary.totalAnalyzed, 6);
    assert.equal(insights.summary.positive.count, 3);
    assert.equal(insights.summary.positive.pct, 50.0);
    assert.equal(insights.summary.negative.count, 2);
    assert.equal(insights.summary.negative.pct, 33.3);
    assert.equal(insights.summary.neutral.count, 1);
    assert.equal(insights.summary.neutral.pct, 16.7);
    assert.equal(insights.summary.needsReplyCount, 2);
    assert.equal(insights.summary.failedCount, 1);
    assert.equal(insights.summary.excludedDuplicates, 1);
    assert.equal(insights.summary.skippedEmpty, 1);

    // Rating agreement
    // Compared: R1, R2, R3, R4, R5 = 5 (R6 had null rating)
    // Mismatches: R5 (rating 5 vs negative) = 1 mismatch
    assert.equal(insights.ratingAgreement.comparedCount, 5);
    assert.equal(insights.ratingAgreement.mismatches.length, 1);
    assert.equal(insights.ratingAgreement.mismatches[0].reviewId, 'R5');
    assert.equal(insights.ratingAgreement.agreementPercent, 80.0);

    // Per-product split
    const widget = insights.byProduct.find((p) => p.product === 'Widget');
    assert.ok(widget);
    assert.equal(widget.total, 3);
    assert.equal(widget.positive, 3);
    assert.equal(widget.negative, 0);

    const gadget = insights.byProduct.find((p) => p.product === 'Gadget');
    assert.ok(gadget);
    assert.equal(gadget.total, 3);
    assert.equal(gadget.positive, 0);
    assert.equal(gadget.negative, 2);
  });

  it('breaks ties alphabetically for top topics and limits to top 3', () => {
    // 4 topics with count 1 each: quality, delivery, packaging, price
    // Alphabetical sort: delivery, packaging, price, quality
    // Top 3 should be: delivery, packaging, price
    const input = [
      {
        reviewId: 'R1',
        rating: 1,
        status: 'valid',
        analysisStatus: 'analyzed',
        analysis: {
          sentiment: 'negative',
          topics: ['quality'],
          summary: 'Bad quality',
          needs_reply: true,
        },
      },
      {
        reviewId: 'R2',
        rating: 1,
        status: 'valid',
        analysisStatus: 'analyzed',
        analysis: {
          sentiment: 'negative',
          topics: ['delivery'],
          summary: 'Late delivery',
          needs_reply: true,
        },
      },
      {
        reviewId: 'R3',
        rating: 1,
        status: 'valid',
        analysisStatus: 'analyzed',
        analysis: {
          sentiment: 'negative',
          topics: ['packaging'],
          summary: 'Torn packaging',
          needs_reply: true,
        },
      },
      {
        reviewId: 'R4',
        rating: 1,
        status: 'valid',
        analysisStatus: 'analyzed',
        analysis: {
          sentiment: 'negative',
          topics: ['price'],
          summary: 'Too expensive',
          needs_reply: true,
        },
      },
    ];

    const insights = computeInsights(input);
    assert.equal(insights.topComplaints.length, 3);
    assert.equal(insights.topComplaints[0].topic, 'delivery');
    assert.equal(insights.topComplaints[1].topic, 'packaging');
    assert.equal(insights.topComplaints[2].topic, 'price');
  });
});
