import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';

import { AppError } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'Route not found'));
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    void _next;
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        logger.error({ err: error }, error.message);
      }

      response.status(error.statusCode).json({
        success: false,
        message: error.message,
        errors: error.errors,
      });
      return;
    }

    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      response.status(400).json({
        success: false,
        message: 'Invalid JSON payload',
        errors: [],
      });
      return;
    }

    logger.error({ err: error }, 'Unhandled application error');
    response.status(500).json({
      success: false,
      message: 'Internal server error',
      errors: [],
    });
  };
}
