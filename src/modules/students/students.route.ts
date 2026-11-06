import { Router } from 'express';
import type { Env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { authenticate, csrfProtection } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/role.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import type { AuthServiceContract } from '../auth/auth.service.js';
import {
  createStudentSchema,
  studentListQuerySchema,
  studentStatusSchema,
  updateStudentSchema,
  type CreateStudentInput,
  type StudentStatusInput,
  type UpdateStudentInput,
} from './students.schemas.js';
import type { StudentServiceContract } from './students.service.js';

function pathParam(params: Record<string, string | string[]>, name: string): string {
  const value = params[name];
  if (typeof value !== 'string') throw new AppError(400, `Missing path parameter: ${name}`);
  return value;
}

export function createStudentsRouter(
  auth: AuthServiceContract,
  students: StudentServiceContract,
  env: Env,
): Router {
  const router = Router();
  router.use(authenticate(auth));
  router.get('/', requireRole('ADMIN'), async (req, res, next) => {
    const q = studentListQuerySchema.safeParse(req.query);
    if (!q.success) return next(new AppError(422, 'Validation failed', q.error.issues));
    try {
      res.json({
        success: true,
        data: await students.listStudents(q.data),
        message: 'Students retrieved',
      });
    } catch (e) {
      next(e);
    }
  });
  router.post(
    '/',
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(createStudentSchema),
    async (req, res, next) => {
      try {
        res.status(201).json({
          success: true,
          data: await students.createStudent(req.body as CreateStudentInput),
          message: 'Student created',
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.get('/:id', requireRole('ADMIN'), async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await students.getStudent(pathParam(req.params, 'id')),
        message: 'Student retrieved',
      });
    } catch (e) {
      next(e);
    }
  });
  router.patch(
    '/:id',
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(updateStudentSchema),
    async (req, res, next) => {
      try {
        res.json({
          success: true,
          data: await students.updateStudent(
            pathParam(req.params, 'id'),
            req.body as UpdateStudentInput,
          ),
          message: 'Student updated',
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.patch(
    '/:id/status',
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(studentStatusSchema),
    async (req, res, next) => {
      try {
        res.json({
          success: true,
          data: await students.updateStudentStatus(
            pathParam(req.params, 'id'),
            req.body as StudentStatusInput,
          ),
          message: 'Student status updated',
        });
      } catch (e) {
        next(e);
      }
    },
  );
  return router;
}
