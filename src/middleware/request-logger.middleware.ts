import { randomUUID } from 'node:crypto';

import pinoHttp from 'pino-http';
import type { Logger } from 'pino';

export function createRequestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId(request, response) {
      const headerId = request.headers['x-request-id'];
      const requestId = typeof headerId === 'string' && headerId.length > 0 ? headerId : randomUUID();
      response.setHeader('x-request-id', requestId);
      return requestId;
    },
  });
}
