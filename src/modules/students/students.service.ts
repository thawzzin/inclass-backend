import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';
import type { CreateStudentInput, StudentListQuery, StudentStatusInput, UpdateStudentInput } from './students.schemas.js';

const selectStudent = { id: true, studentId: true, fullName: true, nickname: true, status: true, createdAt: true, updatedAt: true } as const;
export type Student = { id: string; studentId: string; fullName: string; nickname: string | null; status: 'ACTIVE' | 'INACTIVE'; createdAt: Date; updatedAt: Date };
export interface PaginatedStudents { items: Student[]; page: number; pageSize: number; total: number; totalPages: number; }
export interface StudentServiceContract { listStudents(query: StudentListQuery): Promise<PaginatedStudents>; createStudent(input: CreateStudentInput): Promise<Student>; getStudent(id: string): Promise<Student>; updateStudent(id: string, input: UpdateStudentInput): Promise<Student>; updateStudentStatus(id: string, input: StudentStatusInput): Promise<Student>; }

export class StudentService implements StudentServiceContract {
  public constructor(private readonly prisma: PrismaClient) {}
  public async listStudents(query: StudentListQuery): Promise<PaginatedStudents> {
    const where = { ...(query.status ? { status: query.status } : {}), ...(query.search ? { OR: [{ studentId: { contains: query.search, mode: 'insensitive' as const } }, { fullName: { contains: query.search, mode: 'insensitive' as const } }, { nickname: { contains: query.search, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await this.prisma.$transaction([this.prisma.student.findMany({ where, select: selectStudent, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.prisma.student.count({ where })]);
    return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }
  public async createStudent(input: CreateStudentInput): Promise<Student> {
    try { return await this.prisma.student.create({ data: { studentId: input.studentId, fullName: input.fullName, nickname: input.nickname ?? null }, select: selectStudent }); } catch (error) { if (this.isUnique(error)) throw new AppError(409, 'Student ID is already in use'); throw error; }
  }
  public async getStudent(id: string): Promise<Student> { return this.findStudent(id); }
  public async updateStudent(id: string, input: UpdateStudentInput): Promise<Student> {
    await this.findStudent(id);
    try { return await this.prisma.student.update({ where: { id }, data: { ...(input.studentId === undefined ? {} : { studentId: input.studentId }), ...(input.fullName === undefined ? {} : { fullName: input.fullName }), ...(input.nickname === undefined ? {} : { nickname: input.nickname }) }, select: selectStudent }); } catch (error) { if (this.isUnique(error)) throw new AppError(409, 'Student ID is already in use'); throw error; }
  }
  public async updateStudentStatus(id: string, input: StudentStatusInput): Promise<Student> { await this.findStudent(id); return this.prisma.student.update({ where: { id }, data: { status: input.status }, select: selectStudent }); }
  private async findStudent(id: string): Promise<Student> { const student = await this.prisma.student.findUnique({ where: { id }, select: selectStudent }); if (!student) throw new AppError(404, 'Student not found'); return student; }
  private isUnique(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'; }
}
