import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware.js';
import type { AuthServiceContract } from '../auth/auth.service.js';
import type { DashboardService } from './dashboard.service.js';

export function createDashboardRouter(
  auth: AuthServiceContract,
  dashboard: DashboardService,
): Router {
  const router = Router();
  router.get('/summary', authenticate(auth), async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await dashboard.summary(request.auth!.id, request.auth!.role),
        message: 'Dashboard summary retrieved',
      });
    } catch (error) {
      next(error);
    }
  });
  router.get('/attendance-stats', authenticate(auth), async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await dashboard.attendanceStats(request.auth!.id, request.auth!.role),
        message: 'Attendance statistics retrieved',
      });
    } catch (error) {
      next(error);
    }
  });
  router.get('/recent-attendance', authenticate(auth), async (request, response, next) => {
    try {
      response.json({
        success: true,
        data: await dashboard.recentAttendance(request.auth!.id, request.auth!.role),
        message: 'Recent attendance retrieved',
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
