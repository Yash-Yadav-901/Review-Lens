import { PayloadTooLargeError } from '../../utils/AppError.js';

// ---------------------------------------------------------------------------
// Named constants — no magic strings scattered through the code
// ---------------------------------------------------------------------------

export const STATUS = Object.freeze({
  VALID: 'valid',
  SKIPPED_EMPTY: 'skipped_empty',
  DUPLICATE: 'duplicate',
});

export const ISSUE_TYPE = Object.freeze({
  MISSING_RATING: 'missing_rating',
  INVALID_RATING: 'invalid_rating',
  INVALID_DATE: 'invalid_date',
  MISSING_REVIEW_ID: 'missing_review_id',
  DUPLICATE_REVIEW_ID: 'duplicate_review_id',
  TRUNCATED: 'truncated',
  DUPLICATE_REVIEW: 'duplicate_review',
});

// HTML entities to decode after tag stripping.
const HTML_ENTITIES = Object.freeze({
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
});

const ENTITY_PATTERN = new RegExp(
  Object.keys(HTML_ENTITIES)
    .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g',
);

// Valid ratings are integer strings 1 to 5 inclusive.
const VALID_RATINGS = new Set(['1', '2', '3', '4', '5']);

// YYYY-MM-DD with real calendar validation.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Text cleaning helpers
// ---------------------------------------------------------------------------

/**
 * Strips HTML tags and decodes a small set of common entities.
 * Does not use a DOM parser; handles only the patterns present in the dataset.
 */
function stripHtml(text) {
  // Remove tags first, then decode entities that may have been inside attrs.
  return text.replace(/<[^>]*>/g, '').replace(ENTITY_PATTERN, (match) => HTML_ENTITIES[match]);
}

/**
 * Removes C0 (U+0000-U+001F except U+0009 tab) and C1 (U+007F-U+009F) control
 * characters. Preserves tab, newline-equivalent whitespace that collapseWhitespace
 * will normalise, emoji, Devanagari, and zero-width joiners (U+200D).
 */
function removeControlChars(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

/**
 * Full text cleaning pipeline.
 * Order matters: NFC -> strip HTML -> decode entities -> remove controls ->
 * collapse whitespace -> trim.
 */
function cleanText(raw) {
  return removeControlChars(stripHtml(raw.normalize('NFC')))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes text for duplicate detection.
 * Lowercase + trim + collapse spaces on the already-cleaned, already-truncated text.
 * Exported so the cache layer can reuse the same logic.
 */
export function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Truncates text to maxChars Unicode code points (not UTF-16 units).
 * Spreading into an array gives one element per code point, so multi-byte
 * characters (including emoji) are never split.
 */
function truncateCodePoints(text, maxChars) {
  const points = [...text];
  if (points.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: points.slice(0, maxChars).join(''), truncated: true };
}

// ---------------------------------------------------------------------------
// Rating and date parsing
// ---------------------------------------------------------------------------

function parseRating(raw, reviewId, rowNumber, issues) {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') {
    issues.push({
      row: rowNumber,
      reviewId,
      type: ISSUE_TYPE.MISSING_RATING,
      message: `Row ${rowNumber}: rating is blank`,
    });
    return null;
  }
  if (VALID_RATINGS.has(trimmed)) {
    return Number(trimmed);
  }
  issues.push({
    row: rowNumber,
    reviewId,
    type: ISSUE_TYPE.INVALID_RATING,
    message: `Row ${rowNumber}: invalid rating "${trimmed}"`,
  });
  return null;
}

function parseDate(raw, reviewId, rowNumber, issues) {
  const trimmed = (raw ?? '').trim();
  if (!DATE_RE.test(trimmed)) {
    issues.push({
      row: rowNumber,
      reviewId,
      type: ISSUE_TYPE.INVALID_DATE,
      message: `Row ${rowNumber}: invalid date "${trimmed}"`,
    });
    return null;
  }
  // Verify it is a real calendar date (e.g. not 2026-02-30).
  const d = new Date(trimmed);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== trimmed) {
    issues.push({
      row: rowNumber,
      reviewId,
      type: ISSUE_TYPE.INVALID_DATE,
      message: `Row ${rowNumber}: non-existent date "${trimmed}"`,
    });
    return null;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Cleans raw CSV rows and produces structured review objects with a report.
 *
 * @param {object[]} rows - Raw rows from parseCsv, each with _rowNumber.
 * @param {{ maxReviews: number, maxReviewChars: number }} opts
 * @returns {{ reviews: object[], report: object }}
 */
export function cleanReviews(rows, { maxReviews, maxReviewChars }) {
  if (rows.length > maxReviews) {
    throw new PayloadTooLargeError(
      `Upload contains ${rows.length} rows, which exceeds the limit of ${maxReviews}`,
    );
  }

  const issues = [];
  const reviews = [];

  // Track seen review_ids for duplicate-id detection (separate from text deduplication).
  const seenReviewIds = new Set();
  // Track normalized texts for content deduplication. Maps normalized -> first reviewId.
  const seenNormalizedTexts = new Map();

  // Counters for the report.
  let missingRating = 0;
  let invalidRating = 0;
  let truncatedCount = 0;
  let skippedEmpty = 0;
  let duplicates = 0;

  for (const row of rows) {
    const rowNumber = row._rowNumber;

    // --- review_id ---
    let reviewId = (row.review_id ?? '').trim();
    if (!reviewId) {
      reviewId = `ROW_${rowNumber}`;
      issues.push({
        row: rowNumber,
        reviewId,
        type: ISSUE_TYPE.MISSING_REVIEW_ID,
        message: `Row ${rowNumber}: missing review_id, assigned ${reviewId}`,
      });
    } else if (seenReviewIds.has(reviewId)) {
      issues.push({
        row: rowNumber,
        reviewId,
        type: ISSUE_TYPE.DUPLICATE_REVIEW_ID,
        message: `Row ${rowNumber}: duplicate review_id "${reviewId}"`,
      });
    }
    seenReviewIds.add(reviewId);

    // --- product ---
    const product = (row.product ?? '').trim() || 'Unknown product';

    // --- rating ---
    const issuesLenBefore = issues.length;
    const rating = parseRating(row.rating, reviewId, rowNumber, issues);
    if (issues.length > issuesLenBefore) {
      const lastType = issues[issues.length - 1].type;
      if (lastType === ISSUE_TYPE.MISSING_RATING) {
        missingRating++;
      } else if (lastType === ISSUE_TYPE.INVALID_RATING) {
        invalidRating++;
      }
    }

    // --- date ---
    const date = parseDate(row.date, reviewId, rowNumber, issues);

    // --- text cleaning ---
    const rawText = row.review_text ?? '';
    const cleaned = cleanText(rawText);

    // --- truncation (count code points, not UTF-16 units) ---
    const { text: finalText, truncated } = truncateCodePoints(cleaned, maxReviewChars);
    if (truncated) {
      truncatedCount++;
      issues.push({
        row: rowNumber,
        reviewId,
        type: ISSUE_TYPE.TRUNCATED,
        message: `Row ${rowNumber}: text truncated to ${maxReviewChars} code points`,
      });
    }

    // --- status determination ---
    let status = STATUS.VALID;
    let duplicateOf = null;

    if (!finalText) {
      status = STATUS.SKIPPED_EMPTY;
      skippedEmpty++;
    } else {
      // Deduplicate by normalized content. Empty rows never participate.
      const normalized = normalizeText(finalText);
      if (seenNormalizedTexts.has(normalized)) {
        status = STATUS.DUPLICATE;
        duplicateOf = seenNormalizedTexts.get(normalized);
        duplicates++;
        issues.push({
          row: rowNumber,
          reviewId,
          type: ISSUE_TYPE.DUPLICATE_REVIEW,
          message: `Row ${rowNumber}: duplicate of ${duplicateOf}`,
        });
      } else {
        seenNormalizedTexts.set(normalized, reviewId);
      }
    }

    reviews.push({
      reviewId,
      product,
      rating,
      date,
      text: finalText,
      status,
      duplicateOf,
      flags: { truncated },
    });
  }

  const valid = reviews.filter((r) => r.status === STATUS.VALID).length;

  const report = {
    totalRows: rows.length,
    valid,
    skippedEmpty,
    duplicates,
    missingRating,
    invalidRating,
    truncated: truncatedCount,
    issues,
  };

  return { reviews, report };
}
