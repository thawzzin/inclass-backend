import type { RequestHandler } from 'express';

import type { Env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import type { AuthServiceContract } from '../modules/auth/auth.service.js';
import { getAccessToken, verifyCsrfToken } from '../modules/auth/auth.security.js';

export function authenticate(service: AuthServiceContract): RequestHandler {
  return async (request, _response, next) => {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      next(new AppError(401, 'Authentication is required'));
      return;
    }
    try {
      request.auth = await service.authenticate(accessToken);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function csrfProtection(env: Env): RequestHandler {
  return (request, _response, next) => {
    if (!verifyCsrfToken(request, env)) {
      next(new AppError(403, 'Invalid CSRF token'));
      return;
    }
    next();
  };
}
