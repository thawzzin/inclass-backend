import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';

const testEnv = parseEnv({
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

describe('application infrastructure', () => {
  it('reports healthy when the database check succeeds', async () => {
    const app = createApp({ env: testEnv, checkDatabase: async () => undefined });

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok', database: 'connected' },
      message: 'Service is healthy',
    });
    expect(response.body.data.timestamp).toEqual(expect.any(String));
  });

  it('returns a safe 503 response when the database is unavailable', async () => {
    const app = createApp({
      env: testEnv,
      checkDatabase: async () => {
        throw new Error('postgresql://secret-user:secret-password@secret-host/database');
      },
    });

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      message: 'Database is unavailable',
      errors: [],
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-password');
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const app = createApp({ env: testEnv, checkDatabase: async () => undefined });

    const response = await request(app).get('/api/v1/not-found');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: 'Route not found',
      errors: [],
    });
  });

  it('returns a safe bad-request response for malformed JSON', async () => {
    const app = createApp({ env: testEnv, checkDatabase: async () => undefined });

    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: 'Invalid JSON payload',
      errors: [],
    });
  });

  it('allows the configured frontend origin and credentials', async () => {
    const app = createApp({ env: testEnv, checkDatabase: async () => undefined });

    const response = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows each origin listed in ALLOW_ORIGINS', async () => {
    const app = createApp({
      env: parseEnv({
        ...testEnv,
        PORT: String(testEnv.PORT),
        REFRESH_TOKEN_EXPIRES_IN_DAYS: String(testEnv.REFRESH_TOKEN_EXPIRES_IN_DAYS),
        TRUST_PROXY: 'false',
        ALLOW_ORIGINS: 'https://dev.example.com, https://preview.example.com',
      }),
      checkDatabase: async () => undefined,
    });

    for (const origin of ['https://dev.example.com', 'https://preview.example.com']) {
      const response = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    }

    const rejected = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', testEnv.FRONTEND_URL)
      .set('Access-Control-Request-Method', 'POST');

    expect(rejected.status).toBe(403);
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects browser requests from an unapproved origin', async () => {
    const app = createApp({ env: testEnv, checkDatabase: async () => undefined });

    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://attacker.example');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      message: 'Origin is not allowed',
      errors: [],
    });
  });
});
