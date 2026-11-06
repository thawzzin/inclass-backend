import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import { checkDatabase as defaultDatabaseCheck, type DatabaseCheck } from './config/database.js';
import { getEnv, type Env } from './config/env.js';
import { createLogger } from './config/logger.js';
import { AppError } from './errors/app-error.js';
import { createErrorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { createRequestLogger } from './middleware/request-logger.middleware.js';
import { createHealthRouter } from './routes/health.route.js';

export interface CreateAppOptions {
  env?: Env;
  checkDatabase?: DatabaseCheck;
  logger?: Logger;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const env = options.env ?? getEnv();
  const logger = options.logger ?? createLogger(env);
  const databaseCheck = options.checkDatabase ?? defaultDatabaseCheck;
  const app = express();

  app.disable('x-powered-by');
  app.use(createRequestLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || origin === env.FRONTEND_URL) {
          callback(null, true);
          return;
        }

        callback(new AppError(403, 'Origin is not allowed'));
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1/health', createHealthRouter(databaseCheck));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
