import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import type { AuthServiceContract } from '../src/modules/auth/auth.service.js';
import type { UserServiceContract } from '../src/modules/users/users.service.js';

const env = parseEnv({
  NODE_ENV: 'test', PORT: '4000',
  DATABASE_URL: 'postgresql://user:password@pooler.example.neon.tech/inclass?sslmode=require',
  DIRECT_URL: 'postgresql://user:password@direct.example.neon.tech/inclass?sslmode=require',
  JWT_ACCESS_SECRET: 'a-secure-test-secret-that-is-at-least-32-characters',
  CSRF_SECRET: 'another-secure-test-secret-at-least-32-characters',
  ACCESS_TOKEN_EXPIRES_IN: '15m', REFRESH_TOKEN_EXPIRES_IN_DAYS: '7',
  FRONTEND_URL: 'http://localhost:3000', LOG_LEVEL: 'silent',
});

const teacher = {
  id: '5b12c42b-24f6-43a3-a337-601547f57118', name: 'Teacher One', email: 'teacher@example.com',
  role: 'TEACHER' as const, status: 'ACTIVE' as const, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
};

function auth(role: 'ADMIN' | 'TEACHER'): AuthServiceContract {
  return {
    authenticate: async () => ({ ...teacher, id: 'admin-id', role }),
    login: async () => { throw new Error('not used'); }, refresh: async () => { throw new Error('not used'); },
    logout: async () => undefined, updateProfile: async () => ({ user: teacher }), changePassword: async () => undefined,
  };
}

function users(): UserServiceContract {
  return {
    listTeachers: async () => ({ items: [teacher], page: 1, pageSize: 20, total: 1, totalPages: 1 }),
    createTeacher: async () => teacher, getTeacher: async () => teacher, updateTeacher: async () => teacher,
    updateTeacherStatus: async () => ({ ...teacher, status: 'INACTIVE' }), changeTeacherPassword: async () => undefined,
  };
}

describe('teacher management routes', () => {
  it('allows an admin to list teachers', async () => {
    const app = createApp({ env, authService: auth('ADMIN'), userService: users() });
    const response = await request(app).get('/api/v1/users').set('Cookie', 'inclass_access=token');
    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([teacher]);
  });

  it('forbids a teacher from managing teacher accounts', async () => {
    const app = createApp({ env, authService: auth('TEACHER'), userService: users() });
    const response = await request(app).get('/api/v1/users').set('Cookie', 'inclass_access=token');
    expect(response.status).toBe(403);
  });
});
