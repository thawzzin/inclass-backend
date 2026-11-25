/* global URL, Response, console */
import { httpServerHandler } from 'cloudflare:node';
import { createHash } from 'node:crypto';

import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { getPrisma } from './lib/prisma.js';

const port = 4000;
createApp({ env: getEnv() }).listen(port);

const handler = httpServerHandler({ port });

function loginErrorResponse(request, env, status, message) {
  const headers = {};
  if (request.headers.get('origin') === env.FRONTEND_URL) {
    headers['Access-Control-Allow-Origin'] = env.FRONTEND_URL;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers.Vary = 'Origin';
  }

  return Response.json({ success: false, message, errors: [] }, { status, headers });
}

export default {
  async fetch(request, env, context) {
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
          return loginErrorResponse(request, env, 429, 'Too many login attempts');
        }
        if (Math.random() < 0.01) {
          context.waitUntil(prisma.$executeRaw`
            DELETE FROM "LoginRateLimit" WHERE "windowStart" < now() - interval '1 day'
          `);
        }
      } catch (error) {
        console.error('Login rate limit check failed', {
          name: error instanceof Error ? error.name : 'UnknownError',
          code: error && typeof error === 'object' ? error.code : undefined,
        });
        return loginErrorResponse(request, env, 503, 'Login is temporarily unavailable');
      }
    }
    return handler.fetch(request, env, context);
  },
};
