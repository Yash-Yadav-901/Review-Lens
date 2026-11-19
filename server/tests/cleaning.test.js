import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseCsv } from '../src/modules/cleaning/csvParser.js';
import {
  cleanReviews,
  normalizeText,
  STATUS,
  ISSUE_TYPE,
} from '../src/modules/cleaning/reviewCleaner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// reviews.csv lives in the repo root (server/tests -> server -> repo root).
const REVIEWS_CSV_PATH = resolve(__dirname, '../../reviews.csv');

const DEFAULT_OPTS = { maxReviews: 500, maxReviewChars: 1000 };

// ---------------------------------------------------------------------------
// Helper: parse + clean in one step
// ---------------------------------------------------------------------------
function process(csvString, opts = DEFAULT_OPTS) {
  const { rows } = parseCsv(csvString);
  return cleanReviews(rows, opts);
}

// ---------------------------------------------------------------------------
// Real reviews.csv integration test
// ---------------------------------------------------------------------------
describe('real reviews.csv', () => {
  it('file exists at repo root', () => {
    assert.ok(
      existsSync(REVIEWS_CSV_PATH),
      `reviews.csv not found at ${REVIEWS_CSV_PATH} - place the file in the repo root`,
    );
  });

  it('produces the expected cleaning report', () => {
    if (!existsSync(REVIEWS_CSV_PATH)) {
      return; // already failed in the previous test
    }
    const csv = readFileSync(REVIEWS_CSV_PATH);
    const { rows } = parseCsv(csv);
    const { reviews, report } = cleanReviews(rows, DEFAULT_OPTS);

    assert.equal(report.totalRows, 30, 'totalRows');
    assert.equal(report.valid, 28, 'valid');
    assert.equal(report.skippedEmpty, 1, 'skippedEmpty');
    assert.equal(report.duplicates, 1, 'duplicates');
    assert.equal(report.missingRating, 1, 'missingRating');
    assert.equal(report.invalidRating, 1, 'invalidRating');

    // R005 must be skipped_empty
    const r005 = reviews.find((r) => r.reviewId === 'R005');
    assert.ok(r005, 'R005 must be present');
    assert.equal(r005.status, STATUS.SKIPPED_EMPTY);

    // R015 must be duplicate of R012
    const r015 = reviews.find((r) => r.reviewId === 'R015');
    assert.ok(r015, 'R015 must be present');
    assert.equal(r015.status, STATUS.DUPLICATE);
    assert.equal(r015.duplicateOf, 'R012');

    // R010 must have null rating (missing)
    const r010 = reviews.find((r) => r.reviewId === 'R010');
    assert.ok(r010, 'R010 must be present');
    assert.equal(r010.rating, null);

    // R022 must have null rating (invalid: "five")
    const r022 = reviews.find((r) => r.reviewId === 'R022');
    assert.ok(r022, 'R022 must be present');
    assert.equal(r022.rating, null);

    // R009 emoji-only review must be valid
    const r009 = reviews.find((r) => r.reviewId === 'R009');
    assert.ok(r009, 'R009 must be present');
    assert.equal(r009.status, STATUS.VALID);

    // R016 Devanagari text must be preserved unchanged (after NFC normalise)
    const r016 = reviews.find((r) => r.reviewId === 'R016');
    assert.ok(r016, 'R016 must be present');
    assert.ok(r016.text.includes('\u0906'), 'Devanagari characters must be preserved');

    // R003 sarcasm review must keep its emoji
    const r003 = reviews.find((r) => r.reviewId === 'R003');
    assert.ok(r003, 'R003 must be present');
    assert.ok(
      r003.text.includes('\uD83D\uDE44') || r003.text.includes('\u{1F644}'),
      'R003 must retain its rolling-eyes emoji',
    );
  });
});

// ---------------------------------------------------------------------------
// csvParser unit tests
// ---------------------------------------------------------------------------
describe('csvParser', () => {
  it('handles BOM at the start of the file', () => {
    const bom = '\uFEFF';
    const csv = `${bom}review_id,product,rating,date,review_text\nR001,Widget,5,2024-01-01,Great`;
    const { rows } = parseCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].review_id, 'R001');
  });

  it('handles CRLF line endings', () => {
    const csv = `review_id,product,rating,date,review_text\r\nR001,Widget,5,2024-01-01,Good\r\nR002,Widget,4,2024-01-02,Nice`;
    const { rows } = parseCsv(csv);
    assert.equal(rows.length, 2);
  });

  it('handles quoted multi-line fields', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,2024-01-01,"Line one\nLine two"`;
    const { rows } = parseCsv(csv);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].review_text.includes('Line one'));
    assert.ok(rows[0].review_text.includes('Line two'));
  });

  it('skips a malformed row and collects an issue without crashing', () => {
    // Extra columns on one row triggers relax_column_count skip behaviour
    // when the row also has a parse error (unmatched quote).
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,2024-01-01,Good\n"unclosed,Widget,3,2024-01-02,Bad`;
    const { rows, issues } = parseCsv(csv);
    // Good row must survive
    assert.equal(rows.length, 1);
    assert.equal(rows[0].review_id, 'R001');
    // The malformed row must produce an issue entry
    assert.equal(issues.length, 1);
  });

  it('throws ValidationError when required headers are missing', () => {
    const csv = `id,product,rating,date,text\nR001,Widget,5,2024-01-01,Good`;
    assert.throws(
      () => parseCsv(csv),
      (err) => {
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.ok(err.message.includes('review_id'));
        assert.ok(err.message.includes('review_text'));
        return true;
      },
    );
  });

  it('throws ValidationError for a header-only file', () => {
    const csv = `review_id,product,rating,date,review_text\n`;
    assert.throws(
      () => parseCsv(csv),
      (err) => {
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.ok(err.message.toLowerCase().includes('no data rows'));
        return true;
      },
    );
  });

  it('attaches 1-based row numbers to each row', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,A,5,2024-01-01,X\nR002,B,4,2024-01-02,Y`;
    const { rows } = parseCsv(csv);
    assert.equal(rows[0]._rowNumber, 1);
    assert.equal(rows[1]._rowNumber, 2);
  });
});

// ---------------------------------------------------------------------------
// reviewCleaner unit tests
// ---------------------------------------------------------------------------
describe('reviewCleaner - text cleaning', () => {
  it('strips HTML tags and decodes common entities', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,2024-01-01,"<b>Love it!</b> Price &amp; quality are &quot;great&quot;"`;
    const { reviews } = process(csv);
    assert.equal(reviews[0].text, 'Love it! Price & quality are "great"');
  });

  it('removes C0 and C1 control characters', () => {
    // \x01 is a C0 control char, \x9F is a C1 control char
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,2024-01-01,"Good\x01product\x9F"`;
    const { reviews } = process(csv);
    assert.ok(!reviews[0].text.includes('\x01'));
    assert.ok(!reviews[0].text.includes('\x9F'));
    assert.ok(reviews[0].text.includes('Good'));
  });

  it('preserves emoji', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,3,2024-01-01,Thumbs up \uD83D\uDC4D`;
    const { reviews } = process(csv);
    assert.ok(reviews[0].text.includes('\uD83D\uDC4D'));
  });

  it('preserves Devanagari characters', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,3,2024-01-01,\u0906\u0935\u093E\u091C`;
    const { reviews } = process(csv);
    assert.ok(reviews[0].text.includes('\u0906'));
  });

  it('collapses multiple whitespace to a single space', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,2024-01-01,"too   many    spaces"`;
    const { reviews } = process(csv);
    assert.equal(reviews[0].text, 'too many spaces');
  });
});

describe('reviewCleaner - truncation', () => {
  it('truncates by code points so an emoji at the boundary is not split', () => {
    // Build a text that is exactly 5 ASCII chars + 1 emoji (which is 2 UTF-16 units)
    // Truncate at 5 code points -> emoji must be dropped entirely, not half-kept.
    const emoji = '\uD83D\uDE00'; // U+1F600, 2 UTF-16 units, 1 code point
    const text = `abcd${emoji}xyz`;
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,2024-01-01,${text}`;
    const { reviews, report } = process(csv, { maxReviews: 500, maxReviewChars: 5 });
    // 5 code points = "abcd" + the emoji (index 4). Truncated result should be "abcd" + emoji.
    assert.equal([...reviews[0].text].length, 5);
    assert.equal(reviews[0].flags.truncated, true);
    assert.equal(report.truncated, 1);
  });

  it('does not truncate text at or below the limit', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,2024-01-01,Hello`;
    const { reviews } = process(csv, { maxReviews: 500, maxReviewChars: 10 });
    assert.equal(reviews[0].flags.truncated, false);
  });
});

describe('reviewCleaner - rating', () => {
  it('accepts ratings 1 through 5', () => {
    for (const r of ['1', '2', '3', '4', '5']) {
      const csv = `review_id,product,rating,date,review_text\nR001,Widget,${r},2024-01-01,Good`;
      const { reviews } = process(csv);
      assert.equal(reviews[0].rating, Number(r));
    }
  });

  it('sets null and records missing_rating for a blank rating', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,,2024-01-01,Good`;
    const { reviews, report } = process(csv);
    assert.equal(reviews[0].rating, null);
    assert.equal(report.missingRating, 1);
    assert.ok(report.issues.some((i) => i.type === ISSUE_TYPE.MISSING_RATING));
  });

  it('sets null and records invalid_rating for a word rating', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,five,2024-01-01,Good`;
    const { reviews, report } = process(csv);
    assert.equal(reviews[0].rating, null);
    assert.equal(report.invalidRating, 1);
    assert.ok(report.issues.some((i) => i.type === ISSUE_TYPE.INVALID_RATING));
  });

  it('sets null for rating 0 and 6', () => {
    for (const r of ['0', '6']) {
      const csv = `review_id,product,rating,date,review_text\nR001,Widget,${r},2024-01-01,Good`;
      const { reviews } = process(csv);
      assert.equal(reviews[0].rating, null);
    }
  });
});

describe('reviewCleaner - date', () => {
  it('accepts a valid YYYY-MM-DD date', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,2024-01-15,Good`;
    const { reviews } = process(csv);
    assert.equal(reviews[0].date, '2024-01-15');
  });

  it('sets null for a bad date but keeps the review', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,not-a-date,Good`;
    const { reviews, report } = process(csv);
    assert.equal(reviews[0].date, null);
    assert.equal(reviews[0].status, STATUS.VALID);
    assert.ok(report.issues.some((i) => i.type === ISSUE_TYPE.INVALID_DATE));
  });

  it('sets null for a non-existent calendar date like Feb 30', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,2024-02-30,Good`;
    const { reviews } = process(csv);
    assert.equal(reviews[0].date, null);
  });
});

describe('reviewCleaner - duplicates and empty', () => {
  it('marks an empty review as skipped_empty', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,Widget,5,2024-01-01,""`;
    const { reviews, report } = process(csv);
    assert.equal(reviews[0].status, STATUS.SKIPPED_EMPTY);
    assert.equal(report.skippedEmpty, 1);
    assert.equal(report.valid, 0);
  });

  it('treats case and spacing differences as duplicates', () => {
    const csv = [
      'review_id,product,rating,date,review_text',
      'R001,Widget,5,2024-01-01,Great product',
      'R002,Widget,4,2024-01-02,  GREAT   PRODUCT  ',
    ].join('\n');
    const { reviews, report } = process(csv);
    assert.equal(reviews[0].status, STATUS.VALID);
    assert.equal(reviews[1].status, STATUS.DUPLICATE);
    assert.equal(reviews[1].duplicateOf, 'R001');
    assert.equal(report.duplicates, 1);
  });

  it('does not count empty rows as duplicates of each other', () => {
    const csv = [
      'review_id,product,rating,date,review_text',
      'R001,Widget,5,2024-01-01,""',
      'R002,Widget,4,2024-01-02,""',
    ].join('\n');
    const { reviews, report } = process(csv);
    assert.equal(reviews[0].status, STATUS.SKIPPED_EMPTY);
    assert.equal(reviews[1].status, STATUS.SKIPPED_EMPTY);
    assert.equal(report.duplicates, 0);
  });
});

describe('reviewCleaner - review_id handling', () => {
  it('assigns ROW_<n> for a missing review_id and records an issue', () => {
    const csv = `review_id,product,rating,date,review_text\n,Widget,5,2024-01-01,Good`;
    const { reviews, report } = process(csv);
    assert.equal(reviews[0].reviewId, 'ROW_1');
    assert.ok(report.issues.some((i) => i.type === ISSUE_TYPE.MISSING_REVIEW_ID));
  });

  it('records an issue for a duplicate review_id but keeps both rows', () => {
    const csv = [
      'review_id,product,rating,date,review_text',
      'R001,Widget,5,2024-01-01,First review',
      'R001,Widget,4,2024-01-02,Second review',
    ].join('\n');
    const { reviews, report } = process(csv);
    assert.equal(reviews.length, 2);
    assert.ok(report.issues.some((i) => i.type === ISSUE_TYPE.DUPLICATE_REVIEW_ID));
  });
});

describe('reviewCleaner - limits', () => {
  it('throws PayloadTooLargeError when rows exceed maxReviews', () => {
    const header = 'review_id,product,rating,date,review_text';
    const dataRows = Array.from(
      { length: 3 },
      (_, i) => `R00${i + 1},Widget,5,2024-01-01,Review ${i + 1}`,
    ).join('\n');
    const csv = `${header}\n${dataRows}`;
    const { rows } = parseCsv(csv);
    assert.throws(
      () => cleanReviews(rows, { maxReviews: 2, maxReviewChars: 1000 }),
      (err) => {
        assert.equal(err.code, 'PAYLOAD_TOO_LARGE');
        return true;
      },
    );
  });
});

describe('reviewCleaner - product fallback', () => {
  it('uses Unknown product when product is empty', () => {
    const csv = `review_id,product,rating,date,review_text\nR001,,5,2024-01-01,Good`;
    const { reviews } = process(csv);
    assert.equal(reviews[0].product, 'Unknown product');
  });
});

describe('normalizeText', () => {
  it('lowercases and collapses whitespace', () => {
    assert.equal(normalizeText('  Hello   WORLD  '), 'hello world');
  });
});
