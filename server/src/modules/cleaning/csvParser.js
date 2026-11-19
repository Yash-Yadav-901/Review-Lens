import { parse } from 'csv-parse/sync';
import { ValidationError } from '../../utils/AppError.js';

const REQUIRED_HEADERS = ['review_id', 'product', 'rating', 'date', 'review_text'];

/**
 * Parses a CSV buffer or string into raw row objects.
 * Returns { rows, issues } where issues describes skipped/malformed rows.
 * Throws ValidationError if required headers are missing or no data rows exist.
 *
 * @param {Buffer | string} input
 * @returns {{ rows: object[], issues: Array<{row: number, message: string}> }}
 */
export function parseCsv(input) {
  const skippedIssues = [];

  const records = parse(input, {
    bom: true,
    columns: (headers) => headers.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    relax_column_count: true,
    // Collect skipped rows instead of throwing so a single bad row cannot
    // crash the whole upload.
    skip_records_with_error: true,
    on_skip: (_err, record) => {
      skippedIssues.push({
        row: null,
        message: `Malformed row skipped: ${JSON.stringify(record)}`,
      });
    },
  });

  if (records.length === 0) {
    // Could mean header-only file or genuinely empty after skips.
    // We detect missing headers first by trying a header-only parse.
    const headerCheck = parse(input, { bom: true, to_line: 1 });
    if (headerCheck.length > 0) {
      const headers = headerCheck[0].map((h) => h.trim().toLowerCase());
      const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        throw new ValidationError(`CSV is missing required headers: ${missing.join(', ')}`, {
          missingHeaders: missing,
        });
      }
      throw new ValidationError('CSV file contains a header row but no data rows');
    }
    throw new ValidationError('CSV file is empty');
  }

  // Validate required headers using the first parsed record's keys.
  const presentHeaders = Object.keys(records[0]);
  const missing = REQUIRED_HEADERS.filter((h) => !presentHeaders.includes(h));
  if (missing.length > 0) {
    throw new ValidationError(`CSV is missing required headers: ${missing.join(', ')}`, {
      missingHeaders: missing,
    });
  }

  // Attach a 1-based data row number for issue reporting downstream.
  const rows = records.map((record, i) => ({ ...record, _rowNumber: i + 1 }));

  return { rows, issues: skippedIssues };
}
