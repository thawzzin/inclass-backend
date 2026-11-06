import cors from 'cors';
import cookieParser from 'cookie-parser';
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
import { AuthService, type AuthServiceContract } from './modules/auth/auth.service.js';
import { createAuthRouter } from './modules/auth/auth.route.js';
import { getPrisma } from './lib/prisma.js';
import { UserService, type UserServiceContract } from './modules/users/users.service.js';
import { createUsersRouter } from './modules/users/users.route.js';
import { StudentService, type StudentServiceContract } from './modules/students/students.service.js';
import { createStudentsRouter } from './modules/students/students.route.js';

export interface CreateAppOptions {
  env?: Env;
  checkDatabase?: DatabaseCheck;
  logger?: Logger;
  authService?: AuthServiceContract;
  userService?: UserServiceContract;
  studentService?: StudentServiceContract;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const env = options.env ?? getEnv();
  const logger = options.logger ?? createLogger(env);
  const databaseCheck = options.checkDatabase ?? defaultDatabaseCheck;
  const authService = options.authService ?? new AuthService(getPrisma(), env);
  const userService = options.userService ?? new UserService(getPrisma());
  const studentService = options.studentService ?? new StudentService(getPrisma());
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
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
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1/health', createHealthRouter(databaseCheck));
  app.use('/api/v1/auth', createAuthRouter(authService, env));
  app.use('/api/v1/users', createUsersRouter(authService, userService, env));
  app.use('/api/v1/students', createStudentsRouter(authService, studentService, env));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
