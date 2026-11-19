import { z } from 'zod';

export const SENTIMENTS = Object.freeze(['positive', 'neutral', 'negative']);

export const TOPICS = Object.freeze([
  'quality',
  'delivery',
  'price',
  'packaging',
  'support',
  'size_fit',
  'other',
]);

export const MAX_SUMMARY_CHARS = 200;

export class ModelOutputError extends Error {
  constructor(reason) {
    super(`Model output error: ${reason}`);
    this.name = 'ModelOutputError';
    this.reason = reason;
  }
}

export const analysisItemSchema = z
  .object({
    sentiment: z.enum(SENTIMENTS),
    topics: z
      .array(z.enum(TOPICS))
      .min(1, 'At least one topic is required')
      .refine(
        (topics) => new Set(topics).size === topics.length,
        'Topics array must not contain duplicates',
      ),
    summary: z
      .string()
      .transform((val) => val.trim().replace(/\s+/g, ' '))
      .pipe(
        z
          .string()
          .min(1, 'Summary cannot be empty')
          .max(MAX_SUMMARY_CHARS, `Summary cannot exceed ${MAX_SUMMARY_CHARS} characters`),
      ),
    needs_reply: z.boolean(),
  })
  .strict();

/**
 * Parses the raw text content string returned by the model.
 * Strips one surrounding markdown code fence if present.
 * Requires an object with a "results" array.
 * Throws ModelOutputError with a short reason string without leaking raw review or model output.
 */
export function parseModelContent(content) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new ModelOutputError('empty or non-string content');
  }

  let cleaned = content.trim();
  // Strip a single outer code fence if present (e.g. ```json ... ``` or ``` ...)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim();
  }

  if (cleaned.length === 0) {
    throw new ModelOutputError('empty content after removing code fences');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ModelOutputError('invalid json');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ModelOutputError('root json must be an object');
  }

  if (!Array.isArray(parsed.results)) {
    throw new ModelOutputError('missing results array');
  }

  return parsed.results;
}

/**
 * Validates each item in rawItems against analysisItemSchema.
 * If rawItems.length !== expectedCount, every index returns { ok: false, reason: "count mismatch" }.
 * Otherwise returns an array of { ok: true, analysis } or { ok: false, reason }.
 */
export function validateItems(rawItems, expectedCount) {
  if (!Array.isArray(rawItems) || rawItems.length !== expectedCount) {
    return Array.from({ length: expectedCount }, () => ({
      ok: false,
      reason: 'count mismatch',
    }));
  }

  return rawItems.map((item) => {
    const result = analysisItemSchema.safeParse(item);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join('.') || 'item';
      return {
        ok: false,
        reason: `${field}: ${issue.message}`,
      };
    }
    return {
      ok: true,
      analysis: {
        sentiment: result.data.sentiment,
        topics: result.data.topics,
        summary: result.data.summary,
        needs_reply: result.data.needs_reply,
      },
    };
  });
}
