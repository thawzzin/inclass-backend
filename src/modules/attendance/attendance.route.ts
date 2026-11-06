import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import type { Env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { authenticate, csrfProtection } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import type { AuthServiceContract } from '../auth/auth.service.js';
import type { AttendanceService } from './attendance.service.js';
import {
  bulkRecords,
  createSession,
  recordUpdate,
  type Bulk,
  type CreateSession,
  type RecordUpdate,
} from './attendance.schemas.js';

function pathParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== 'string') throw new AppError(400, `Missing path parameter: ${name}`);
  return value;
}

export function attendanceRouter(
  auth: AuthServiceContract,
  service: AttendanceService,
  env: Env,
): Router {
  const router = Router({ mergeParams: true });
  router.get(
    '/sections/:id/attendance-sessions',
    authenticate(auth),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.json({
          success: true,
          data: await service.list(pathParam(request, 'id'), request.auth!.id, request.auth!.role),
          message: 'Attendance sessions retrieved',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/sections/:id/attendance-sessions',
    authenticate(auth),
    csrfProtection(env),
    validateBody(createSession),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.status(201).json({
          success: true,
          data: await service.create(
            pathParam(request, 'id'),
            (request.body as CreateSession).date,
            request.auth!.id,
            request.auth!.role,
          ),
          message: 'Attendance session created',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    '/attendance-sessions/:id',
    authenticate(auth),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.json({
          success: true,
          data: await service.detail(
            pathParam(request, 'id'),
            request.auth!.id,
            request.auth!.role,
          ),
          message: 'Attendance session retrieved',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/attendance-sessions/:id/records/bulk',
    authenticate(auth),
    csrfProtection(env),
    validateBody(bulkRecords),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.status(201).json({
          success: true,
          data: await service.bulk(
            pathParam(request, 'id'),
            (request.body as Bulk).records,
            request.auth!.id,
            request.auth!.role,
          ),
          message: 'Attendance recorded',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.patch(
    '/attendance-sessions/:id/records/:studentId',
    authenticate(auth),
    csrfProtection(env),
    validateBody(recordUpdate),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        await service.update(
          pathParam(request, 'id'),
          pathParam(request, 'studentId'),
          (request.body as RecordUpdate).status,
          request.auth!.id,
          request.auth!.role,
        );
        response.json({ success: true, data: {}, message: 'Attendance updated' });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/attendance-sessions/:id/records/mark-all-present',
    authenticate(auth),
    csrfProtection(env),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        response.json({
          success: true,
          data: await service.allPresent(
            pathParam(request, 'id'),
            request.auth!.id,
            request.auth!.role,
          ),
          message: 'Unmarked students marked present',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
