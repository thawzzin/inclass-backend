import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';
import type { AuthRole } from '../modules/auth/auth.types.js';

export function requireRole(...roles: AuthRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth || !roles.includes(request.auth.role)) {
      next(new AppError(403, 'You do not have permission to perform this action'));
      return;
    }
    next();
  };
}
