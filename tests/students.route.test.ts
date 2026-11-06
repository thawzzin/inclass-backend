import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import type { AuthServiceContract } from '../src/modules/auth/auth.service.js';
import type { StudentServiceContract } from '../src/modules/students/students.service.js';

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
const admin = {
  id: 'admin',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
};
const student = {
  id: 'student',
  studentId: '65000001',
  fullName: 'Student One',
  nickname: 'One',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};
const auth: AuthServiceContract = {
  authenticate: async () => admin,
  login: async () => {
    throw new Error('not used');
  },
  refresh: async () => {
    throw new Error('not used');
  },
  logout: async () => undefined,
  updateProfile: async () => ({ user: admin }),
  changePassword: async () => undefined,
};
const students: StudentServiceContract = {
  listStudents: async () => ({ items: [student], page: 1, pageSize: 20, total: 1, totalPages: 1 }),
  createStudent: async () => student,
  getStudent: async () => student,
  updateStudent: async () => student,
  updateStudentStatus: async () => ({ ...student, status: 'INACTIVE' }),
};

describe('student routes', () => {
  it('lists students for an administrator', async () => {
    const response = await request(createApp({ env, authService: auth, studentService: students }))
      .get('/api/v1/students')
      .set('Cookie', 'inclass_access=token');
    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([
      { ...student, createdAt: student.createdAt.toJSON(), updatedAt: student.updatedAt.toJSON() },
    ]);
  });
});
