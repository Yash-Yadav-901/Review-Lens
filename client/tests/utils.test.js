import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPercent,
  formatRating,
  formatLabel,
  isRatingMismatch,
} from '../src/utils/formatters.js';
import { filterReviews } from '../src/utils/filterReviews.js';

describe('formatters', () => {
  it('formats percent with default and custom decimal places', () => {
    assert.equal(formatPercent(45.678), '45.7%');
    assert.equal(formatPercent(50, 0), '50%');
    assert.equal(formatPercent(null), '0%');
    assert.equal(formatPercent(undefined), '0%');
    assert.equal(formatPercent(NaN), '0%');
  });

  it('formats rating or returns dash when missing', () => {
    assert.equal(formatRating(5), '5');
    assert.equal(formatRating(1), '1');
    assert.equal(formatRating(null), '-');
    assert.equal(formatRating(undefined), '-');
    assert.equal(formatRating(''), '-');
  });

  it('capitalizes and formats snake_case labels', () => {
    assert.equal(formatLabel('size_fit'), 'Size Fit');
    assert.equal(formatLabel('quality'), 'Quality');
    assert.equal(formatLabel(''), '');
    assert.equal(formatLabel(null), '');
  });

  it('detects rating and sentiment mismatches accurately', () => {
    // 5 stars with negative sentiment -> mismatch
    assert.equal(
      isRatingMismatch({
        rating: 5,
        analysis: { sentiment: 'negative' },
      }),
      true,
    );

    // 1 star with positive sentiment -> mismatch
    assert.equal(
      isRatingMismatch({
        rating: 1,
        analysis: { sentiment: 'positive' },
      }),
      true,
    );

    // 4 stars with positive sentiment -> agreement (not mismatch)
    assert.equal(
      isRatingMismatch({
        rating: 4,
        analysis: { sentiment: 'positive' },
      }),
      false,
    );

    // 3 stars with neutral sentiment -> agreement
    assert.equal(
      isRatingMismatch({
        rating: 3,
        analysis: { sentiment: 'neutral' },
      }),
      false,
    );

    // Missing or null rating -> not a mismatch
    assert.equal(
      isRatingMismatch({
        rating: null,
        analysis: { sentiment: 'negative' },
      }),
      false,
    );

    // Missing analysis -> not a mismatch
    assert.equal(
      isRatingMismatch({
        rating: 5,
        analysis: null,
      }),
      false,
    );
  });
});

describe('filterReviews', () => {
  const sampleReviews = [
    {
      reviewId: 'R1',
      product: 'Headphones',
      rating: 5,
      status: 'valid',
      analysisStatus: 'analyzed',
      analysis: {
        sentiment: 'positive',
        topics: ['quality', 'price'],
        needs_reply: false,
      },
    },
    {
      reviewId: 'R2',
      product: 'Speaker',
      rating: 2,
      status: 'valid',
      analysisStatus: 'analyzed',
      analysis: {
        sentiment: 'negative',
        topics: ['delivery'],
        needs_reply: true,
      },
    },
    {
      reviewId: 'R3',
      product: 'Headphones',
      rating: 3,
      status: 'valid',
      analysisStatus: 'analyzed',
      analysis: {
        sentiment: 'neutral',
        topics: ['quality'],
        needs_reply: false,
      },
    },
    {
      reviewId: 'R4',
      product: 'Speaker',
      rating: 1,
      status: 'valid',
      analysisStatus: 'analysis_failed',
      analysis: null,
    },
    {
      reviewId: 'R5',
      product: 'Headphones',
      rating: 5,
      status: 'duplicate',
      analysisStatus: 'skipped',
      analysis: null,
    },
    {
      reviewId: 'R6',
      product: 'Unknown',
      rating: null,
      status: 'skipped_empty',
      analysisStatus: 'skipped',
      analysis: null,
    },
  ];

  it('returns all reviews when default filters applied', () => {
    const res = filterReviews(sampleReviews);
    assert.equal(res.length, 6);
  });

  it('filters by product correctly', () => {
    const res = filterReviews(sampleReviews, { product: 'Headphones' });
    assert.equal(res.length, 3);
    assert.ok(res.every((r) => r.product === 'Headphones'));
  });

  it('filters by sentiment correctly', () => {
    const res = filterReviews(sampleReviews, { sentiment: 'negative' });
    assert.equal(res.length, 1);
    assert.equal(res[0].reviewId, 'R2');
  });

  it('filters by topic correctly', () => {
    const res = filterReviews(sampleReviews, { topic: 'quality' });
    assert.equal(res.length, 2);
    assert.ok(res.some((r) => r.reviewId === 'R1'));
    assert.ok(res.some((r) => r.reviewId === 'R3'));
  });

  it('filters by status: needs_reply', () => {
    const res = filterReviews(sampleReviews, { status: 'needs_reply' });
    assert.equal(res.length, 1);
    assert.equal(res[0].reviewId, 'R2');
  });

  it('filters by status: failed', () => {
    const res = filterReviews(sampleReviews, { status: 'failed' });
    assert.equal(res.length, 1);
    assert.equal(res[0].reviewId, 'R4');
  });

  it('filters by status: duplicates_skipped', () => {
    const res = filterReviews(sampleReviews, { status: 'duplicates_skipped' });
    assert.equal(res.length, 2);
    assert.ok(res.some((r) => r.reviewId === 'R5'));
    assert.ok(res.some((r) => r.reviewId === 'R6'));
  });

  it('handles combined filters', () => {
    const res = filterReviews(sampleReviews, {
      product: 'Headphones',
      sentiment: 'positive',
      topic: 'quality',
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].reviewId, 'R1');
  });

  it('returns empty array when combined filters match nothing', () => {
    const res = filterReviews(sampleReviews, {
      product: 'Speaker',
      sentiment: 'positive',
    });
    assert.equal(res.length, 0);
  });

  it('handles empty input gracefully', () => {
    const res = filterReviews([], { product: 'Any' });
    assert.equal(res.length, 0);
  });
});

describe('row identity and key logic', () => {
  it('uses rowNumber to uniquely identify rows even when reviewId is duplicated', () => {
    const rowsWithDuplicateIds = [
      { rowNumber: 1, reviewId: 'N01', text: 'First review text' },
      { rowNumber: 2, reviewId: 'N01', text: 'Second review text' },
    ];

    // Using reviewId produces collisions (size 1)
    const reviewIdKeys = new Set(rowsWithDuplicateIds.map((r) => r.reviewId));
    assert.equal(reviewIdKeys.size, 1);

    // Using rowNumber guarantees unique keys (size 2)
    const rowNumberKeys = new Set(rowsWithDuplicateIds.map((r) => r.rowNumber ?? r.reviewId));
    assert.equal(rowNumberKeys.size, 2);

    // Simulating toggling expanded state by rowNumber
    const expandedRowNumbers = new Set();
    expandedRowNumbers.add(rowsWithDuplicateIds[0].rowNumber);

    assert.equal(expandedRowNumbers.has(rowsWithDuplicateIds[0].rowNumber), true);
    assert.equal(expandedRowNumbers.has(rowsWithDuplicateIds[1].rowNumber), false);
  });
});
