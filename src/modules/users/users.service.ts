import argon2 from 'argon2';
import type { PrismaClient } from '../../generated/prisma/client.js';

import { AppError } from '../../errors/app-error.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateTeacherInput, TeacherListQuery, TeacherPasswordInput, TeacherStatusInput, UpdateTeacherInput } from './users.schemas.js';

const teacherSelect = { id: true, name: true, email: true, role: true, status: true, createdAt: true, updatedAt: true } as const;
export type Teacher = AuthUser & { createdAt: Date; updatedAt: Date };
export interface PaginatedTeachers { items: Teacher[]; page: number; pageSize: number; total: number; totalPages: number; }

export interface UserServiceContract {
  listTeachers(query: TeacherListQuery): Promise<PaginatedTeachers>;
  createTeacher(input: CreateTeacherInput): Promise<Teacher>;
  getTeacher(id: string): Promise<Teacher>;
  updateTeacher(id: string, input: UpdateTeacherInput): Promise<Teacher>;
  updateTeacherStatus(id: string, input: TeacherStatusInput): Promise<Teacher>;
  changeTeacherPassword(id: string, input: TeacherPasswordInput): Promise<void>;
}

export class UserService implements UserServiceContract {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listTeachers(query: TeacherListQuery): Promise<PaginatedTeachers> {
    const where = {
      role: 'TEACHER' as const,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { email: { contains: query.search, mode: 'insensitive' as const } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: teacherSelect, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.user.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }

  public async createTeacher(input: CreateTeacherInput): Promise<Teacher> {
    try {
      return await this.prisma.user.create({ data: { name: input.name, email: input.email.toLowerCase(), passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }), role: 'TEACHER' }, select: teacherSelect });
    } catch (error) {
      if (this.isUnique(error)) throw new AppError(409, 'Email address is already in use');
      throw error;
    }
  }

  public async getTeacher(id: string): Promise<Teacher> { return this.findTeacher(id); }

  public async updateTeacher(id: string, input: UpdateTeacherInput): Promise<Teacher> {
    await this.findTeacher(id);
    try {
      return await this.prisma.user.update({ where: { id }, data: { ...(input.name === undefined ? {} : { name: input.name }), ...(input.email === undefined ? {} : { email: input.email.toLowerCase() }) }, select: teacherSelect });
    } catch (error) {
      if (this.isUnique(error)) throw new AppError(409, 'Email address is already in use');
      throw error;
    }
  }

  public async updateTeacherStatus(id: string, input: TeacherStatusInput): Promise<Teacher> {
    await this.findTeacher(id);
    return this.prisma.$transaction(async (transaction) => {
      const teacher = await transaction.user.update({ where: { id }, data: { status: input.status, tokenVersion: { increment: 1 } }, select: teacherSelect });
      await transaction.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return teacher;
    });
  }

  public async changeTeacherPassword(id: string, input: TeacherPasswordInput): Promise<void> {
    await this.findTeacher(id);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
      await transaction.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }

  private async findTeacher(id: string): Promise<Teacher> {
    const teacher = await this.prisma.user.findFirst({ where: { id, role: 'TEACHER' }, select: teacherSelect });
    if (!teacher) throw new AppError(404, 'Teacher not found');
    return teacher;
  }

  private isUnique(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'; }
}
