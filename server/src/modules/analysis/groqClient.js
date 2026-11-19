import { ExternalServiceError } from '../../utils/AppError.js';

/**
 * Parses HTTP Retry-After header into milliseconds.
 * Returns null if missing or unparseable.
 */
export function parseRetryAfter(header) {
  if (!header || typeof header !== 'string') {
    return null;
  }
  const trimmed = header.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Check if it is a number of seconds
  const seconds = Number(trimmed);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  // Try parsing as HTTP Date
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }

  return null;
}

/**
 * Computes backoff delay with exponential factor and jitter, respecting Retry-After and caps.
 */
export function computeBackoffDelay({
  attempt,
  baseDelayMs,
  maxDelayMs,
  retryAfterMs,
  random = Math.random,
}) {
  // Exponential base: base * 2^attempt
  const expDelay = baseDelayMs * Math.pow(2, attempt);
  // Add full jitter between 0 and 50% of the calculated base delay
  const jitter = expDelay * 0.5 * random();
  let delay = expDelay + jitter;

  if (typeof retryAfterMs === 'number' && retryAfterMs > delay) {
    delay = retryAfterMs;
  }

  return Math.min(Math.round(delay), maxDelayMs);
}

/**
 * Factory for creating Groq client with retry and timeout logic.
 */
export function createGroqClient({
  config,
  fetchFn = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  logger,
}) {
  const apiKey = config.GROQ_API_KEY;
  const baseUrl = config.GROQ_BASE_URL.replace(/\/+$/, '');
  const model = config.GROQ_MODEL;
  const timeoutMs = config.REQUEST_TIMEOUT_MS;
  const maxRetries = config.MAX_RETRIES;
  const baseDelayMs = config.RETRY_BASE_DELAY_MS;
  const maxDelayMs = config.RETRY_MAX_DELAY_MS;
  const reasoningEffort = config.GROQ_REASONING_EFFORT;
  const maxCompletionTokens = config.GROQ_MAX_OUTPUT_TOKENS;

  async function chat({ system, user }) {
    let attempts = 0;

    while (true) {
      try {
        const url = `${baseUrl}/chat/completions`;
        const body = {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0,
          reasoning_effort: reasoningEffort,
          include_reasoning: false,
          max_completion_tokens: maxCompletionTokens,
          response_format: { type: 'json_object' },
        };

        const signal = AbortSignal.timeout(timeoutMs);
        const res = await fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });

        if (!res.ok) {
          const status = res.status;

          // Non-retryable 4xx
          if (status === 401 || status === 403) {
            throw new ExternalServiceError('Groq authentication failed', {
              code: 'LLM_AUTH_FAILED',
              retryable: false,
              statusCode: status,
            });
          }

          if (status >= 400 && status < 500 && status !== 429) {
            throw new ExternalServiceError('Invalid request to Groq API', {
              code: 'LLM_BAD_REQUEST',
              retryable: false,
              statusCode: status,
            });
          }

          // Retryable status: 429 or 5xx
          const isRateLimit = status === 429;
          if (attempts >= maxRetries) {
            throw new ExternalServiceError(
              isRateLimit
                ? 'Groq rate limit exceeded after retries'
                : 'Groq API unavailable after retries',
              {
                code: isRateLimit ? 'LLM_RATE_LIMITED' : 'LLM_UNAVAILABLE',
                retryable: true,
                statusCode: status,
              },
            );
          }

          const retryAfterHeader = res.headers ? res.headers.get('retry-after') : null;
          const retryAfterMs = parseRetryAfter(retryAfterHeader);
          const waitMs = computeBackoffDelay({
            attempt: attempts,
            baseDelayMs,
            maxDelayMs,
            retryAfterMs,
            random,
          });

          if (logger) {
            logger.warn('Retrying Groq API request', {
              attempt: attempts + 1,
              waitMs,
              status,
            });
          }

          attempts++;
          await sleep(waitMs);
          continue;
        }

        // Successfully received 200 OK
        const data = await res.json();
        if (
          !data ||
          !Array.isArray(data.choices) ||
          data.choices.length === 0 ||
          !data.choices[0].message
        ) {
          throw new ExternalServiceError('Malformed response from Groq API', {
            code: 'LLM_BAD_RESPONSE',
            retryable: false,
          });
        }

        const choice = data.choices[0];
        return {
          content: choice.message.content,
          finishReason: choice.finish_reason ?? null,
          usage: data.usage ?? null,
          retries: attempts,
        };
      } catch (err) {
        if (err instanceof ExternalServiceError) {
          throw err;
        }

        // Network error or timeout (AbortError)
        if (attempts >= maxRetries) {
          throw new ExternalServiceError('Groq network error or timeout after retries', {
            code: 'LLM_UNAVAILABLE',
            retryable: true,
          });
        }

        const waitMs = computeBackoffDelay({
          attempt: attempts,
          baseDelayMs,
          maxDelayMs,
          retryAfterMs: null,
          random,
        });

        if (logger) {
          logger.warn('Retrying Groq API request after network error or timeout', {
            attempt: attempts + 1,
            waitMs,
          });
        }

        attempts++;
        await sleep(waitMs);
      }
    }
  }

  return { chat };
}
