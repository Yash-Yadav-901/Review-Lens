// Number of top topics to surface in complaints and praises
const TOP_N = 3;

// Number of example summaries to include per top topic
const EXAMPLES_PER_TOPIC = 2;

/**
 * Maps a numeric rating to the equivalent sentiment bucket.
 * 1-2 -> negative, 3 -> neutral, 4-5 -> positive
 * Returns null when rating is null.
 */
function ratingToSentiment(rating) {
  if (rating === null || rating === undefined) {
    return null;
  }
  if (rating <= 2) {
    return 'negative';
  }
  if (rating === 3) {
    return 'neutral';
  }
  return 'positive';
}

/**
 * Returns the top-N topics (by count) among the given reviews, ties broken alphabetically.
 * Returns an array of { topic, count, examples } where examples is up to EXAMPLES_PER_TOPIC summaries.
 */
function topTopics(analyzedReviews, targetSentiment) {
  const topicCountMap = new Map();
  const topicSummaryMap = new Map();

  for (const review of analyzedReviews) {
    if (review.analysis.sentiment !== targetSentiment) {
      continue;
    }
    for (const topic of review.analysis.topics) {
      topicCountMap.set(topic, (topicCountMap.get(topic) ?? 0) + 1);
      if (!topicSummaryMap.has(topic)) {
        topicSummaryMap.set(topic, []);
      }
      const summaries = topicSummaryMap.get(topic);
      if (summaries.length < EXAMPLES_PER_TOPIC) {
        summaries.push(review.analysis.summary);
      }
    }
  }

  return Array.from(topicCountMap.entries())
    .sort(([topicA, countA], [topicB, countB]) => {
      // Sort by count descending, then alphabetically ascending for tie-breaking
      if (countB !== countA) {
        return countB - countA;
      }
      return topicA.localeCompare(topicB);
    })
    .slice(0, TOP_N)
    .map(([topic, count]) => ({
      topic,
      count,
      examples: topicSummaryMap.get(topic) ?? [],
    }));
}

/**
 * Computes insights from an array of enriched review objects.
 *
 * Only reviews with analysisStatus === 'analyzed' are counted in the analysis.
 * Skipped (empty/duplicate) and failed reviews are reported in summary counts only.
 */
export function computeInsights(enrichedReviews) {
  const analyzedReviews = enrichedReviews.filter((r) => r.analysisStatus === 'analyzed');
  const failedReviews = enrichedReviews.filter((r) => r.analysisStatus === 'analysis_failed');

  const skippedEmpty = enrichedReviews.filter((r) => r.status === 'skipped_empty').length;
  const excludedDuplicates = enrichedReviews.filter((r) => r.status === 'duplicate').length;

  const totalAnalyzed = analyzedReviews.length;

  const positiveReviews = analyzedReviews.filter((r) => r.analysis.sentiment === 'positive');
  const neutralReviews = analyzedReviews.filter((r) => r.analysis.sentiment === 'neutral');
  const negativeReviews = analyzedReviews.filter((r) => r.analysis.sentiment === 'negative');
  const needsReplyReviews = analyzedReviews.filter((r) => r.analysis.needs_reply);

  function pct(n) {
    if (totalAnalyzed === 0) {
      return 0;
    }
    return Math.round((n / totalAnalyzed) * 100 * 10) / 10;
  }

  const summary = {
    totalAnalyzed,
    positive: { count: positiveReviews.length, pct: pct(positiveReviews.length) },
    neutral: { count: neutralReviews.length, pct: pct(neutralReviews.length) },
    negative: { count: negativeReviews.length, pct: pct(negativeReviews.length) },
    needsReplyCount: needsReplyReviews.length,
    failedCount: failedReviews.length,
    excludedDuplicates,
    skippedEmpty,
  };

  const topComplaints = topTopics(analyzedReviews, 'negative');
  const topPraises = topTopics(analyzedReviews, 'positive');

  // Per-product breakdown
  const productMap = new Map();
  for (const review of analyzedReviews) {
    const product = review.product ?? 'Unknown product';
    if (!productMap.has(product)) {
      productMap.set(product, { total: 0, positive: 0, neutral: 0, negative: 0, negReviews: [] });
    }
    const entry = productMap.get(product);
    entry.total++;
    entry[review.analysis.sentiment]++;
    if (review.analysis.sentiment === 'negative') {
      entry.negReviews.push(review);
    }
  }

  const byProduct = Array.from(productMap.entries()).map(([product, data]) => ({
    product,
    total: data.total,
    positive: data.positive,
    neutral: data.neutral,
    negative: data.negative,
    topNegativeTopics: topTopics(data.negReviews, 'negative'),
  }));

  // Rating agreement
  const reviewsWithRating = analyzedReviews.filter((r) => r.rating !== null);
  const comparedCount = reviewsWithRating.length;
  const mismatches = [];

  for (const review of reviewsWithRating) {
    const expectedSentiment = ratingToSentiment(review.rating);
    if (expectedSentiment !== review.analysis.sentiment) {
      mismatches.push({
        rowNumber: review.rowNumber,
        reviewId: review.reviewId,
        rating: review.rating,
        sentiment: review.analysis.sentiment,
      });
    }
  }

  const agreementPercent =
    comparedCount === 0
      ? 100
      : Math.round(((comparedCount - mismatches.length) / comparedCount) * 100 * 10) / 10;

  const ratingAgreement = {
    comparedCount,
    agreementPercent,
    mismatches,
  };

  return { summary, topComplaints, topPraises, byProduct, ratingAgreement };
}
