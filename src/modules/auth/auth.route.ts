import { rateLimit } from 'express-rate-limit';
import { Router } from 'express';

import type { Env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { authenticate, csrfProtection } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import {
  getRefreshToken,
  clearAuthCookies,
  issueCsrfToken,
  setAuthCookies,
} from './auth.security.js';
import { loginSchema, passwordChangeSchema, profileSchema, type LoginInput, type PasswordChangeInput, type ProfileInput } from './auth.schemas.js';
import type { AuthServiceContract } from './auth.service.js';

function loginRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({ success: false, message: 'Too many login attempts', errors: [] });
    },
  });
}

export function createAuthRouter(service: AuthServiceContract, env: Env): Router {
  const router = Router();

  router.get('/csrf', (_request, response) => {
    response.status(200).json({
      success: true,
      data: { csrfToken: issueCsrfToken(response, env) },
      message: 'CSRF token issued',
    });
  });

  router.post('/login', loginRateLimiter(), csrfProtection(env), validateBody(loginSchema), async (request, response, next) => {
    try {
      const session = await service.login(request.body as LoginInput);
      setAuthCookies(response, session.accessToken, session.refreshToken, env);
      response.status(200).json({ success: true, data: { user: session.user }, message: 'Login successful' });
    } catch (error) {
      next(error);
    }
  });

  router.post('/refresh', csrfProtection(env), async (request, response, next) => {
    try {
      const refreshToken = getRefreshToken(request);
      if (!refreshToken) throw new AppError(401, 'Refresh session is required');
      const session = await service.refresh(refreshToken);
      setAuthCookies(response, session.accessToken, session.refreshToken, env);
      response.status(200).json({ success: true, data: { user: session.user }, message: 'Access token refreshed' });
    } catch (error) {
      clearAuthCookies(response, env);
      next(error);
    }
  });

  router.post('/logout', csrfProtection(env), async (request, response, next) => {
    try {
      await service.logout(getRefreshToken(request));
      clearAuthCookies(response, env);
      response.status(200).json({ success: true, data: {}, message: 'Logout successful' });
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', authenticate(service), (request, response) => {
    response.status(200).json({ success: true, data: { user: request.auth }, message: 'Current user retrieved' });
  });

  router.patch('/profile', authenticate(service), csrfProtection(env), validateBody(profileSchema), async (request, response, next) => {
    try {
      const result = await service.updateProfile(request.auth!.id, request.body as ProfileInput);
      if (result.accessToken && result.refreshToken) setAuthCookies(response, result.accessToken, result.refreshToken, env);
      response.status(200).json({ success: true, data: { user: result.user }, message: 'Profile updated' });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/password', authenticate(service), csrfProtection(env), validateBody(passwordChangeSchema), async (request, response, next) => {
    try {
      await service.changePassword(request.auth!.id, request.body as PasswordChangeInput);
      clearAuthCookies(response, env);
      response.status(200).json({ success: true, data: {}, message: 'Password changed; please sign in again' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
