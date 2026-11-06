import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { Env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { authenticate, csrfProtection } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/role.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import type { AuthServiceContract } from '../auth/auth.service.js';
import {
  assignment,
  courseCreate,
  courseUpdate,
  sectionCreate,
  sectionUpdate,
  statusSchema,
  type Assignment,
  type CourseCreate,
  type CourseUpdate,
  type SectionCreate,
  type SectionUpdate,
  type Status,
} from './academics.schemas.js';
import type { AcademicsServiceContract } from './academics.service.js';

function pathParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== 'string') throw new AppError(400, `Missing path parameter: ${name}`);
  return value;
}

function respond(
  action: (request: Request) => Promise<unknown>,
  message: string,
  status = 200,
): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.status(status).json({ success: true, data: await action(request), message });
    } catch (error) {
      next(error);
    }
  };
}

export function createAcademicsRouter(
  auth: AuthServiceContract,
  service: AcademicsServiceContract,
  env: Env,
): Router {
  const router = Router();
  router.get(
    '/courses',
    authenticate(auth),
    respond(
      (request) => service.listCourses(request.auth!.id, request.auth!.role),
      'Courses retrieved',
    ),
  );
  router.get(
    '/courses/:id',
    authenticate(auth),
    respond(
      (request) =>
        service.getCourse(pathParam(request, 'id'), request.auth!.id, request.auth!.role),
      'Course retrieved',
    ),
  );
  router.get(
    '/sections',
    authenticate(auth),
    respond(
      (request) => service.listSections(request.auth!.id, request.auth!.role),
      'Sections retrieved',
    ),
  );
  router.get(
    '/sections/:id',
    authenticate(auth),
    respond(
      (request) =>
        service.getSection(pathParam(request, 'id'), request.auth!.id, request.auth!.role),
      'Section retrieved',
    ),
  );

  router.post(
    '/courses',
    authenticate(auth),
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(courseCreate),
    respond((request) => service.createCourse(request.body as CourseCreate), 'Course created', 201),
  );
  router.patch(
    '/courses/:id',
    authenticate(auth),
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(courseUpdate),
    respond(
      (request) => service.updateCourse(pathParam(request, 'id'), request.body as CourseUpdate),
      'Course updated',
    ),
  );
  router.patch(
    '/courses/:id/status',
    authenticate(auth),
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(statusSchema),
    respond(
      (request) => service.courseStatus(pathParam(request, 'id'), request.body as Status),
      'Course status updated',
    ),
  );
  router.post(
    '/sections',
    authenticate(auth),
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(sectionCreate),
    respond(
      (request) => service.createSection(request.body as SectionCreate),
      'Section created',
      201,
    ),
  );
  router.patch(
    '/sections/:id',
    authenticate(auth),
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(sectionUpdate),
    respond(
      (request) => service.updateSection(pathParam(request, 'id'), request.body as SectionUpdate),
      'Section updated',
    ),
  );
  router.patch(
    '/sections/:id/status',
    authenticate(auth),
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(statusSchema),
    respond(
      (request) => service.sectionStatus(pathParam(request, 'id'), request.body as Status),
      'Section status updated',
    ),
  );
  router.patch(
    '/sections/:id/teacher',
    authenticate(auth),
    requireRole('ADMIN'),
    csrfProtection(env),
    validateBody(assignment),
    respond(
      (request) => service.assignTeacher(pathParam(request, 'id'), request.body as Assignment),
      'Teacher assigned',
    ),
  );
  return router;
}
