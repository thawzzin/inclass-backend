import { Router } from 'express';

import type { DatabaseCheck } from '../config/database.js';
import { AppError } from '../errors/app-error.js';

export function createHealthRouter(checkDatabase: DatabaseCheck): Router {
  const router = Router();

  router.get('/', async (_request, response, next) => {
    try {
      await checkDatabase();
      response.status(200).json({
        success: true,
        data: {
          status: 'ok',
          database: 'connected',
          timestamp: new Date().toISOString(),
        },
        message: 'Service is healthy',
      });
    } catch {
      next(new AppError(503, 'Database is unavailable'));
    }
  });

  return router;
}
