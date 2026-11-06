import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import type { Env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { authenticate, csrfProtection } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import type { AuthServiceContract } from '../auth/auth.service.js';
import type { AttendanceServiceContract } from './attendance.service.js';
import {
  attendanceHistoryQuery,
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
  service: AttendanceServiceContract,
  env: Env,
): Router {
  const router = Router({ mergeParams: true });
  router.get('/attendance-records', authenticate(auth), async (request, response, next) => {
    const parsed = attendanceHistoryQuery.safeParse(request.query);
    if (!parsed.success) return next(new AppError(422, 'Validation failed', parsed.error.issues));
    try {
      if (parsed.data.format === 'csv') {
        response
          .type('text/csv')
          .attachment('attendance-records.csv')
          .send(await service.exportCsv(parsed.data, request.auth!.id, request.auth!.role));
        return;
      }
      const data = await service.history(parsed.data, request.auth!.id, request.auth!.role);
      response.json({ success: true, data, message: 'Attendance records retrieved' });
    } catch (error) {
      next(error);
    }
  });
  router.get(
    '/sections/:id/attendance-statistics',
    authenticate(auth),
    async (request, response, next) => {
      const parsed = attendanceHistoryQuery
        .pick({ dateFrom: true, dateTo: true })
        .safeParse(request.query);
      if (!parsed.success) return next(new AppError(422, 'Validation failed', parsed.error.issues));
      try {
        response.json({
          success: true,
          data: await service.statistics(
            pathParam(request, 'id'),
            parsed.data,
            request.auth!.id,
            request.auth!.role,
          ),
          message: 'Attendance statistics retrieved',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get('/students/:id/attendance', authenticate(auth), async (request, response, next) => {
    const parsed = attendanceHistoryQuery
      .pick({ dateFrom: true, dateTo: true })
      .safeParse(request.query);
    if (!parsed.success) return next(new AppError(422, 'Validation failed', parsed.error.issues));
    try {
      response.json({
        success: true,
        data: await service.studentHistory(
          pathParam(request, 'id'),
          parsed.data,
          request.auth!.id,
          request.auth!.role,
        ),
        message: 'Student attendance retrieved',
      });
    } catch (error) {
      next(error);
    }
  });
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
