import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import type { AuthServiceContract } from '../src/modules/auth/auth.service.js';

const env = parseEnv({
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgresql://user:password@pooler.example.neon.tech/inclass?sslmode=require',
  DIRECT_URL: 'postgresql://user:password@direct.example.neon.tech/inclass?sslmode=require',
  JWT_ACCESS_SECRET: 'a-secure-test-secret-that-is-at-least-32-characters',
  CSRF_SECRET: 'another-secure-test-secret-at-least-32-characters',
  ACCESS_TOKEN_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN_DAYS: '7',
  FRONTEND_URL: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
});

const user = {
  id: '0f2cc176-542f-4fde-b61b-4fef72de8164',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
};

function createAuthService(): AuthServiceContract {
  return {
    authenticate: async () => user,
    login: async () => ({ user, accessToken: 'access-token', refreshToken: 'refresh-token' }),
    refresh: async () => ({
      user,
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
    }),
    logout: async () => undefined,
    updateProfile: async () => ({
      user,
      accessToken: 'replacement-access-token',
      refreshToken: 'replacement-refresh-token',
    }),
    changePassword: async () => undefined,
  };
}

async function csrfToken(
  app: ReturnType<typeof createApp>,
): Promise<{ token: string; cookie: string }> {
  const response = await request(app).get('/api/v1/auth/csrf');
  const [setCookie] = response.headers['set-cookie'] ?? [];
  if (!setCookie) throw new Error('CSRF response did not set a cookie');
  const [cookie] = setCookie.split(';');
  if (!cookie) throw new Error('CSRF cookie is malformed');
  return { token: response.body.data.csrfToken as string, cookie };
}

describe('authentication routes', () => {
  it('sets cross-site cookies for the production frontend', async () => {
    const productionEnv = { ...env, NODE_ENV: 'production' as const };
    const app = createApp({ env: productionEnv, authService: createAuthService() });
    const csrfResponse = await request(app).get('/api/v1/auth/csrf');
    const csrfCookies = ([] as string[]).concat(csrfResponse.headers['set-cookie'] ?? []);
    expect(csrfCookies[0]).toContain('SameSite=None');
    expect(csrfCookies[0]).toContain('Secure');

    const [csrfCookie] = csrfCookies[0]!.split(';');
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', csrfCookie!)
      .set('X-CSRF-Token', csrfResponse.body.data.csrfToken as string)
      .send({ email: 'admin@example.com', password: 'correct-horse-battery-staple' });

    expect(response.status).toBe(200);
    for (const cookie of ([] as string[]).concat(response.headers['set-cookie'] ?? [])) {
      expect(cookie).toContain('SameSite=None');
      expect(cookie).toContain('Secure');
    }
  });
  it('rejects a login request without a CSRF token', async () => {
    const app = createApp({ env, authService: createAuthService() });

    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Invalid CSRF token');
  });

  it('sets HttpOnly access and refresh cookies after a valid login', async () => {
    const app = createApp({ env, authService: createAuthService() });
    const csrf = await csrfToken(app);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', csrf.cookie)
      .set('X-CSRF-Token', csrf.token)
      .send({ email: 'admin@example.com', password: 'correct-horse-battery-staple' });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual(user);
    const cookies = response.headers['set-cookie'];
    expect(Array.isArray(cookies) ? cookies.join(';') : (cookies ?? '')).toContain('HttpOnly');
  });

  it('returns the current database-authorized user', async () => {
    const app = createApp({ env, authService: createAuthService() });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'inclass_access=access-token');

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual(user);
  });
});
