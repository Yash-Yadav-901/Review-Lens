import { z } from 'zod';
import { config } from '../../config/env.js';

export const MAX_REPLY_CHARS = 600;
export const MAX_PRODUCT_CHARS = 120;

export const replyRequestSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Review text cannot be empty')
      .max(
        config.MAX_REVIEW_CHARS,
        `Review text cannot exceed ${config.MAX_REVIEW_CHARS} characters`,
      ),
    product: z
      .string()
      .trim()
      .max(MAX_PRODUCT_CHARS, `Product name cannot exceed ${MAX_PRODUCT_CHARS} characters`)
      .optional(),
  })
  .strict();

export const replyModelOutputSchema = z.object({
  reply: z
    .string()
    .trim()
    .min(1, 'Reply cannot be empty')
    .max(MAX_REPLY_CHARS, `Reply cannot exceed ${MAX_REPLY_CHARS} characters`),
});

/**
 * Parses and validates raw model content against replyModelOutputSchema.
 * Returns the validated reply string, or null on any parse/schema failure.
 */
export function parseReplyContent(content) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    return null;
  }

  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    const result = replyModelOutputSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return result.data.reply;
  } catch {
    return null;
  }
}
