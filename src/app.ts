import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import { checkDatabase as defaultDatabaseCheck, type DatabaseCheck } from './config/database.js';
import { allowedOrigins, getEnv, type Env } from './config/env.js';
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
import {
  StudentService,
  type StudentServiceContract,
} from './modules/students/students.service.js';
import { createStudentsRouter } from './modules/students/students.route.js';
import {
  AcademicsService,
  type AcademicsServiceContract,
} from './modules/academics/academics.service.js';
import { createAcademicsRouter } from './modules/academics/academics.route.js';
import { EnrollmentService } from './modules/enrollments/enrollments.service.js';
import { createEnrollmentsRouter } from './modules/enrollments/enrollments.route.js';
import { AttendanceService } from './modules/attendance/attendance.service.js';
import { attendanceRouter } from './modules/attendance/attendance.route.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import { createDashboardRouter } from './modules/dashboard/dashboard.route.js';

export interface CreateAppOptions {
  env?: Env;
  checkDatabase?: DatabaseCheck;
  logger?: Logger;
  authService?: AuthServiceContract;
  userService?: UserServiceContract;
  studentService?: StudentServiceContract;
  academicsService?: AcademicsServiceContract;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const env = options.env ?? getEnv();
  const logger = options.logger ?? createLogger(env);
  const databaseCheck = options.checkDatabase ?? defaultDatabaseCheck;
  const prisma = getPrisma(env.DATABASE_URL);
  const authService = options.authService ?? new AuthService(prisma, env);
  const userService = options.userService ?? new UserService(prisma);
  const studentService = options.studentService ?? new StudentService(prisma);
  const academicsService = options.academicsService ?? new AcademicsService(prisma);
  const enrollmentService = new EnrollmentService(prisma);
  const attendanceService = new AttendanceService(prisma);
  const dashboardService = new DashboardService(prisma);
  const app = express();
  const corsOrigins = new Set(allowedOrigins(env));

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(createRequestLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || corsOrigins.has(origin)) {
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
  app.use('/api/v1', createAcademicsRouter(authService, academicsService, env));
  app.use(
    '/api/v1/sections/:id/enrollments',
    createEnrollmentsRouter(authService, enrollmentService, env),
  );
  app.use('/api/v1', attendanceRouter(authService, attendanceService, env));
  app.use('/api/v1/dashboard', createDashboardRouter(authService, dashboardService));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
