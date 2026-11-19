import { createRequire } from 'module';
import { z } from 'zod';

// dotenv must load before anything else reads process.env
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config();

// Build the validation schema given the NODE_ENV of the input being validated.
// GROQ_API_KEY is optional only in test so the test suite runs without a real key.
function buildSchema(nodeEnv) {
  const apiKeySchema =
    nodeEnv === 'test'
      ? z.string().optional().default('')
      : z.string().min(1, 'GROQ_API_KEY is required');

  return z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
    GROQ_API_KEY: apiKeySchema,
    GROQ_MODEL: z.string().min(1).default('llama-3.3-70b-versatile'),
    DB_PATH: z.string().min(1).default('./reviewlens.db'),
    BATCH_SIZE: z.coerce.number().int().min(1).max(20).default(5),
    MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
    RETRY_BASE_DELAY_MS: z.coerce.number().int().min(100).default(1000),
    MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(50).default(5),
    MAX_REVIEWS: z.coerce.number().int().min(1).default(500),
    MAX_REVIEW_CHARS: z.coerce.number().int().min(50).default(1000),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(60),
  });
}

// Exported for unit testing without side effects on process.env.
export function validateEnv(raw) {
  // Inspect NODE_ENV from the raw input to decide which schema variant to use.
  const nodeEnv = raw.NODE_ENV ?? 'development';
  const schema = buildSchema(nodeEnv);
  const result = schema.safeParse(raw);

  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  return Object.freeze(result.data);
}

export const config = validateEnv(process.env);
