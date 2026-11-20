import { ExternalServiceError } from '../../utils/AppError.js';
import { buildReplyMessages } from '../analysis/promptBuilder.js';
import { parseReplyContent } from './reply.schema.js';

/**
 * Creates reply service to generate AI customer service replies for reviews.
 *
 * @param {{ client: object, logger?: object }} deps
 */
export function createReplyService({ client, logger }) {
  /**
   * Generates a customer service reply for a review.
   *
   * @param {{ text: string, product?: string }} params
   * @returns {Promise<{ reply: string }>}
   */
  async function generateReply({ text, product }) {
    const messages = buildReplyMessages({ text, product });

    // Primary call
    let chatRes;
    try {
      chatRes = await client.chat(messages);
    } catch (err) {
      if (err instanceof ExternalServiceError) {
        throw err;
      }
      throw new ExternalServiceError('Failed to communicate with LLM for reply', {
        code: 'LLM_BAD_RESPONSE',
        retryable: false,
      });
    }

    let reply = parseReplyContent(chatRes.content);

    // If invalid, execute one re-ask
    if (!reply) {
      if (logger) {
        logger.warn('Initial reply output invalid; attempting re-ask', {
          finishReason: chatRes.finishReason,
        });
      }

      try {
        const reaskRes = await client.chat(messages);
        reply = parseReplyContent(reaskRes.content);
      } catch (err) {
        if (err instanceof ExternalServiceError) {
          throw err;
        }
        throw new ExternalServiceError('Re-ask call failed for reply', {
          code: 'LLM_BAD_RESPONSE',
          retryable: false,
        });
      }

      if (!reply) {
        throw new ExternalServiceError('Model failed to generate a valid reply after re-ask', {
          code: 'LLM_BAD_RESPONSE',
          retryable: false,
        });
      }
    }

    if (logger) {
      logger.info('Generated customer review reply successfully');
    }

    return { reply };
  }

  return { generateReply };
}
