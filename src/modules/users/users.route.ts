import { Router } from 'express';

import type { Env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { authenticate, csrfProtection } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/role.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import type { AuthServiceContract } from '../auth/auth.service.js';
import {
  createTeacherSchema,
  statusSchema,
  teacherListQuerySchema,
  teacherPasswordSchema,
  updateTeacherSchema,
  type CreateTeacherInput,
  type TeacherPasswordInput,
  type TeacherStatusInput,
  type UpdateTeacherInput,
} from './users.schemas.js';
import type { UserServiceContract } from './users.service.js';

function pathParam(params: Record<string, string | string[]>, name: string): string {
  const value = params[name];
  if (typeof value !== 'string') throw new AppError(400, `Missing path parameter: ${name}`);
  return value;
}

export function createUsersRouter(
  authService: AuthServiceContract,
  userService: UserServiceContract,
  env: Env,
): Router {
  const router = Router();
  router.use(authenticate(authService), requireRole('ADMIN'));

  router.get('/', async (request, response, next) => {
    const query = teacherListQuerySchema.safeParse(request.query);
    if (!query.success) return next(new AppError(422, 'Validation failed', query.error.issues));
    try {
      response.status(200).json({
        success: true,
        data: await userService.listTeachers(query.data),
        message: 'Teachers retrieved',
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/',
    csrfProtection(env),
    validateBody(createTeacherSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          success: true,
          data: await userService.createTeacher(request.body as CreateTeacherInput),
          message: 'Teacher created',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get('/:id', async (request, response, next) => {
    try {
      response.status(200).json({
        success: true,
        data: await userService.getTeacher(pathParam(request.params, 'id')),
        message: 'Teacher retrieved',
      });
    } catch (error) {
      next(error);
    }
  });
  router.patch(
    '/:id',
    csrfProtection(env),
    validateBody(updateTeacherSchema),
    async (request, response, next) => {
      try {
        response.status(200).json({
          success: true,
          data: await userService.updateTeacher(
            pathParam(request.params, 'id'),
            request.body as UpdateTeacherInput,
          ),
          message: 'Teacher updated',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.patch(
    '/:id/status',
    csrfProtection(env),
    validateBody(statusSchema),
    async (request, response, next) => {
      try {
        response.status(200).json({
          success: true,
          data: await userService.updateTeacherStatus(
            pathParam(request.params, 'id'),
            request.body as TeacherStatusInput,
          ),
          message: 'Teacher status updated',
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.patch(
    '/:id/password',
    csrfProtection(env),
    validateBody(teacherPasswordSchema),
    async (request, response, next) => {
      try {
        await userService.changeTeacherPassword(
          pathParam(request.params, 'id'),
          request.body as TeacherPasswordInput,
        );
        response.status(200).json({ success: true, data: {}, message: 'Teacher password changed' });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
