// Minimal structured logger. No external dependency. Writes to stdout/stderr.
// Output is JSON in production (easy to ingest) and plain text otherwise.

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const env = process.env.NODE_ENV ?? 'development';
const isProd = env === 'production';
// In tests, only errors should surface to keep output clean.
const minLevel = env === 'test' ? LEVELS.error : LEVELS.debug;

function write(level, message, meta = {}) {
  if (LEVELS[level] < minLevel) {
    return;
  }

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const output = isProd ? JSON.stringify(entry) : formatPlain(entry);
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(output + '\n');
}

function formatPlain({ level, message, timestamp, ...rest }) {
  const prefix = `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${message}`;
  const extras = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
  return prefix + extras;
}

export const logger = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};
