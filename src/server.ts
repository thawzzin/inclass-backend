import 'dotenv/config';

import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { disconnectPrisma } from './lib/prisma.js';

const env = getEnv();
const logger = createLogger(env);
const app = createApp({ env, logger });
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'InClass API started');
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down InClass API');

  server.close(async (error) => {
    try {
      await disconnectPrisma();
    } catch (disconnectError) {
      logger.error({ err: disconnectError }, 'Failed to disconnect Prisma');
    }

    if (error) {
      logger.error({ err: error }, 'HTTP server shutdown failed');
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection');
  process.exit(1);
});
