/**
 * Formats a number as a percentage string.
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0%';
  }
  return `${Number(value).toFixed(decimals)}%`;
}

/**
 * Formats a numeric rating or returns a dash when unknown.
 */
export function formatRating(rating) {
  if (rating === null || rating === undefined || rating === '') {
    return '-';
  }
  return String(rating);
}

/**
 * Capitalizes a status or sentiment string for human-readable display.
 */
export function formatLabel(str) {
  if (!str) {
    return '';
  }
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Checks whether a review has a rating mismatch with its sentiment.
 * Ratings 1-2 expected negative, 3 neutral, 4-5 positive.
 */
export function isRatingMismatch(review) {
  if (!review || review.rating === null || review.rating === undefined) {
    return false;
  }
  if (!review.analysis || !review.analysis.sentiment) {
    return false;
  }

  const rating = Number(review.rating);
  let expectedSentiment = null;
  if (rating <= 2) {
    expectedSentiment = 'negative';
  } else if (rating === 3) {
    expectedSentiment = 'neutral';
  } else if (rating >= 4) {
    expectedSentiment = 'positive';
  }

  return expectedSentiment !== null && expectedSentiment !== review.analysis.sentiment;
}
