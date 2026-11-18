import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export function createRequestLogger(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const headerId = request.headers['x-request-id'];
    const requestId =
      typeof headerId === 'string' && headerId.length > 0 ? headerId : randomUUID();
    const startedAt = Date.now();

    response.setHeader('x-request-id', requestId);
    response.on('finish', () => {
      logger.info(
        {
          reqId: requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          responseTime: Date.now() - startedAt,
        },
        'request completed',
      );
    });

    next();
  };
}
