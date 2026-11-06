import { describe, expect, it } from 'vitest';

import { parseEnv } from '../src/config/env.js';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgresql://user:password@pooler.example.neon.tech/inclass?sslmode=require',
  DIRECT_URL: 'postgresql://user:password@direct.example.neon.tech/inclass?sslmode=require',
  JWT_ACCESS_SECRET: 'a-secure-test-secret-that-is-at-least-32-characters',
  ACCESS_TOKEN_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN_DAYS: '7',
  FRONTEND_URL: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
} as const;

describe('parseEnv', () => {
  it('parses and coerces a valid configuration', () => {
    const result = parseEnv(validEnv);

    expect(result.PORT).toBe(4000);
    expect(result.REFRESH_TOKEN_EXPIRES_IN_DAYS).toBe(7);
    expect(result.NODE_ENV).toBe('test');
  });

  it('rejects a database URL without required TLS', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        DATABASE_URL: 'postgresql://user:password@pooler.example.neon.tech/inclass',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects a short access-token secret', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });
});
