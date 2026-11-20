import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { createContainer } from './container.js';

const container = createContainer();
const app = createApp({
  reviewsService: container.reviewsService,
  replyService: container.replyService,
});

const server = app.listen(config.PORT, () => {
  logger.info('Server started', { port: config.PORT, env: config.NODE_ENV });
});

function shutdown(signal) {
  logger.info('Shutdown signal received', { signal });
  server.close(() => {
    container.close();
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit if connections hang longer than 10 seconds.
  setTimeout(() => {
    logger.error('Forced exit after graceful shutdown timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  process.exit(1);
});
