/**
 * Filters an array of review objects based on user-selected criteria.
 *
 * @param {Array} reviews
 * @param {object} filters
 * @param {string} [filters.product] - 'all' or specific product name
 * @param {string} [filters.sentiment] - 'all' or 'positive' | 'neutral' | 'negative'
 * @param {string} [filters.topic] - 'all' or specific topic
 * @param {string} [filters.status] - 'all' | 'needs_reply' | 'failed' | 'duplicates_skipped'
 * @returns {Array} Filtered reviews
 */
export function filterReviews(reviews = [], filters = {}) {
  const { product = 'all', sentiment = 'all', topic = 'all', status = 'all' } = filters;

  return reviews.filter((review) => {
    // 1. Product filter
    if (product !== 'all' && review.product !== product) {
      return false;
    }

    // 2. Sentiment filter
    if (sentiment !== 'all') {
      if (!review.analysis || review.analysis.sentiment !== sentiment) {
        return false;
      }
    }

    // 3. Topic filter
    if (topic !== 'all') {
      if (!review.analysis || !Array.isArray(review.analysis.topics)) {
        return false;
      }
      if (!review.analysis.topics.includes(topic)) {
        return false;
      }
    }

    // 4. Status filter
    if (status !== 'all') {
      if (status === 'needs_reply') {
        if (!review.analysis || review.analysis.needs_reply !== true) {
          return false;
        }
      } else if (status === 'failed') {
        if (review.analysisStatus !== 'analysis_failed') {
          return false;
        }
      } else if (status === 'duplicates_skipped') {
        if (review.status !== 'duplicate' && review.status !== 'skipped_empty') {
          return false;
        }
      }
    }

    return true;
  });
}
