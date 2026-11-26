/* global URL, Response, console */
import { httpServerHandler } from 'cloudflare:node';
import { createHash } from 'node:crypto';

import { createApp } from './app.js';
import { allowedOrigins, getEnv } from './config/env.js';
import { getPrisma, requestPrismaProxy, withRequestPrisma } from './lib/prisma.js';

const port = 4000;
createApp({ env: getEnv(), prisma: requestPrismaProxy }).listen(port);

const handler = httpServerHandler({ port });

function errorResponse(request, env, status, message) {
  const headers = {};
  const origin = request.headers.get('origin');
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers.Vary = 'Origin';
  }

  return Response.json({ success: false, message, errors: [] }, { status, headers });
}

function safeErrorDetails(error) {
  const message = error instanceof Error ? error.message : '';
  return {
    name: error instanceof Error ? error.name : 'UnknownError',
    code: error && typeof error === 'object' ? error.code : undefined,
    message: /:\/\/|password|secret|token/i.test(message) ? '[redacted]' : message.slice(0, 200),
  };
}

export default {
  async fetch(request, env, context) {
    return withRequestPrisma(env.DATABASE_URL, async () => {
      const url = new URL(request.url);
      if (request.method === 'POST' && url.pathname === '/api/v1/auth/login') {
        try {
          const ip = request.headers.get('cf-connecting-ip') || 'unknown';
          const ipHash = createHash('sha256').update(ip).digest('hex');
          const prisma = getPrisma(env.DATABASE_URL);
          const rows = await prisma.$queryRaw`
          INSERT INTO "LoginRateLimit" ("ipHash", "windowStart", "attempts")
          VALUES (${ipHash}, now(), 1)
          ON CONFLICT ("ipHash") DO UPDATE SET
            "windowStart" = CASE WHEN "LoginRateLimit"."windowStart" < now() - interval '15 minutes'
              THEN now() ELSE "LoginRateLimit"."windowStart" END,
            "attempts" = CASE WHEN "LoginRateLimit"."windowStart" < now() - interval '15 minutes'
              THEN 1 ELSE "LoginRateLimit"."attempts" + 1 END
          RETURNING "attempts"
        `;
          if (rows[0]?.attempts > 10) {
            return errorResponse(request, env, 429, 'Too many login attempts');
          }
          if (Math.random() < 0.01) {
            try {
              await prisma.$executeRaw`
                DELETE FROM "LoginRateLimit" WHERE "windowStart" < now() - interval '1 day'
              `;
            } catch (error) {
              console.error('Login rate limit cleanup failed', safeErrorDetails(error));
            }
          }
        } catch (error) {
          console.error('Login rate limit check failed', safeErrorDetails(error));
          return errorResponse(request, env, 503, 'Login is temporarily unavailable');
        }
      }
      try {
        return await handler.fetch(request, env, context);
      } catch (error) {
        console.error('Worker request failed', safeErrorDetails(error));
        return errorResponse(request, env, 500, 'Internal server error');
      }
    });
  },
};
