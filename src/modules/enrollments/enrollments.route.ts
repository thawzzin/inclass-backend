import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import type { Env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { authenticate, csrfProtection } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/role.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import type { AuthServiceContract } from '../auth/auth.service.js';
import {
  bulkEnrollmentSchema,
  enrollmentSchema,
  type BulkEnrollmentInput,
  type EnrollmentInput,
} from './enrollments.schemas.js';
import type { EnrollmentService } from './enrollments.service.js';

function pathParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== 'string') throw new AppError(400, `Missing path parameter: ${name}`);
  return value;
}

export function createEnrollmentsRouter(
  auth: AuthServiceContract,
  service: EnrollmentService,
  env: Env,
): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate(auth));
  router.get('/', async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        success: true,
        data: await service.list(pathParam(request, 'id'), request.auth!.id, request.auth!.role),
        message: 'Enrollments retrieved',
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/',
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(enrollmentSchema),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.status(201).json({
          success: true,
          data: await service.enroll(
            pathParam(request, 'id'),
            (request.body as EnrollmentInput).studentId,
          ),
          message: 'Student enrolled',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/bulk',
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(bulkEnrollmentSchema),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.status(201).json({
          success: true,
          data: await service.bulk(
            pathParam(request, 'id'),
            (request.body as BulkEnrollmentInput).studentIds,
          ),
          message: 'Students enrolled',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.delete(
    '/:studentId',
    requireRole('ADMIN'),
    csrfProtection(env),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        await service.remove(pathParam(request, 'id'), pathParam(request, 'studentId'));
        response.json({ success: true, data: {}, message: 'Enrollment removed' });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
