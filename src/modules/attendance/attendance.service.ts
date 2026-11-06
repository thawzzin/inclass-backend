import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';
import { calculateAttendanceStatistics } from './attendance.statistics.js';
import type { AttendanceHistoryQuery } from './attendance.schemas.js';

export interface AttendanceServiceContract {
  list(sectionId: string, userId: string, role: string): Promise<unknown>;
  create(sectionId: string, date: string, userId: string, role: string): Promise<unknown>;
  detail(id: string, userId: string, role: string): Promise<unknown>;
  bulk(
    id: string,
    records: { studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' }[],
    userId: string,
    role: string,
  ): Promise<unknown>;
  update(
    id: string,
    studentId: string,
    status: 'PRESENT' | 'ABSENT' | 'LATE',
    userId: string,
    role: string,
  ): Promise<void>;
  allPresent(id: string, userId: string, role: string): Promise<unknown>;
  history(
    query: AttendanceHistoryQuery,
    userId: string,
    role: string,
  ): Promise<{
    items: unknown[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>;
  exportCsv(query: AttendanceHistoryQuery, userId: string, role: string): Promise<string>;
  statistics(
    sectionId: string,
    query: Pick<AttendanceHistoryQuery, 'dateFrom' | 'dateTo'>,
    userId: string,
    role: string,
  ): Promise<ReturnType<typeof calculateAttendanceStatistics>>;
  studentHistory(
    studentId: string,
    query: Pick<AttendanceHistoryQuery, 'dateFrom' | 'dateTo'>,
    userId: string,
    role: string,
  ): Promise<unknown>;
}
export class AttendanceService implements AttendanceServiceContract {
  constructor(private readonly p: PrismaClient) {}
  async allowed(sectionId: string, uid: string, role: string) {
    const s = await this.p.section.findFirst({
      where: { id: sectionId, ...(role === 'ADMIN' ? {} : { teacherId: uid }) },
      select: { id: true },
    });
    if (!s) throw new AppError(404, 'Section not found');
  }
  async create(sectionId: string, date: string, uid: string, role: string) {
    await this.allowed(sectionId, uid, role);
    try {
      return await this.p.$transaction(async (tx) => {
        const session = await tx.attendanceSession.create({
          data: { sectionId, date: new Date(`${date}T00:00:00.000Z`), createdById: uid },
        });
        const enrolled = await tx.enrollment.findMany({
          where: { sectionId, student: { status: 'ACTIVE' } },
          select: { studentId: true },
        });
        if (enrolled.length)
          await tx.attendanceSessionStudent.createMany({
            data: enrolled.map((x) => ({
              attendanceSessionId: session.id,
              studentId: x.studentId,
            })),
          });
        return session;
      });
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002')
        throw new AppError(409, 'Attendance session already exists for this date');
      throw e;
    }
  }
  async detail(id: string, uid: string, role: string) {
    const s = await this.p.attendanceSession.findFirst({
      where: { id, section: { ...(role === 'ADMIN' ? {} : { teacherId: uid }) } },
      include: { roster: { include: { student: true, attendanceRecord: true } }, section: true },
    });
    if (!s) throw new AppError(404, 'Attendance session not found');
    return s;
  }
  async list(sectionId: string, uid: string, role: string) {
    await this.allowed(sectionId, uid, role);
    return this.p.attendanceSession.findMany({ where: { sectionId }, orderBy: { date: 'desc' } });
  }
  async bulk(
    id: string,
    records: { studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' }[],
    uid: string,
    role: string,
  ) {
    const session = await this.detail(id, uid, role);
    return this.p.$transaction(async (tx) => {
      const roster = await tx.attendanceSessionStudent.findMany({
        where: { attendanceSessionId: id },
        select: { studentId: true },
      });
      const allowed = new Set(roster.map((x) => x.studentId));
      if (records.some((r) => !allowed.has(r.studentId)))
        throw new AppError(422, 'Student is not in the captured roster');
      const existing = await tx.attendanceRecord.count({
        where: { attendanceSessionId: id, studentId: { in: records.map((r) => r.studentId) } },
      });
      if (existing) throw new AppError(409, 'Attendance record already exists');
      await tx.attendanceRecord.createMany({
        data: records.map((r) => ({ attendanceSessionId: id, ...r })),
      });
      return session;
    });
  }
  async update(
    id: string,
    studentId: string,
    status: 'PRESENT' | 'ABSENT' | 'LATE',
    uid: string,
    role: string,
  ) {
    await this.detail(id, uid, role);
    const r = await this.p.attendanceRecord.updateMany({
      where: { attendanceSessionId: id, studentId },
      data: { status },
    });
    if (!r.count) throw new AppError(404, 'Attendance record not found');
  }
  async allPresent(id: string, uid: string, role: string) {
    await this.detail(id, uid, role);
    return this.p.$transaction(async (tx) => {
      const roster = await tx.attendanceSessionStudent.findMany({
        where: { attendanceSessionId: id },
        select: { studentId: true },
      });
      const existing = await tx.attendanceRecord.findMany({
        where: { attendanceSessionId: id },
        select: { studentId: true },
      });
      const set = new Set(existing.map((x) => x.studentId));
      const data = roster
        .filter((x) => !set.has(x.studentId))
        .map((x) => ({
          attendanceSessionId: id,
          studentId: x.studentId,
          status: 'PRESENT' as const,
        }));
      if (data.length) await tx.attendanceRecord.createMany({ data });
      return { marked: data.length };
    });
  }
  private sessions(
    query: Pick<AttendanceHistoryQuery, 'sectionId' | 'dateFrom' | 'dateTo'>,
    uid: string,
    role: string,
  ): Prisma.AttendanceSessionWhereInput {
    return {
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
              ...(query.dateTo ? { lte: new Date(`${query.dateTo}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
      ...(role === 'ADMIN' ? {} : { section: { teacherId: uid } }),
    };
  }
  async history(query: AttendanceHistoryQuery, uid: string, role: string) {
    const session = this.sessions(query, uid, role);
    const where: Prisma.AttendanceRecordWhereInput = {
      attendanceSessionStudent: { attendanceSession: session },
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await this.p.$transaction([
      this.p.attendanceRecord.count({ where }),
      this.p.attendanceRecord.findMany({
        where,
        include: {
          attendanceSessionStudent: {
            include: {
              student: true,
              attendanceSession: { include: { section: { include: { course: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
  async exportCsv(query: AttendanceHistoryQuery, uid: string, role: string) {
    const session = this.sessions(query, uid, role);
    const records = await this.p.attendanceRecord.findMany({
      where: {
        attendanceSessionStudent: { attendanceSession: session },
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        attendanceSessionStudent: {
          include: {
            student: true,
            attendanceSession: { include: { section: { include: { course: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    return [
      'courseCode,sectionCode,date,studentId,fullName,status',
      ...records.map((record) =>
        [
          record.attendanceSessionStudent.attendanceSession.section.course.code,
          record.attendanceSessionStudent.attendanceSession.section.sectionCode,
          record.attendanceSessionStudent.attendanceSession.date.toISOString().slice(0, 10),
          record.attendanceSessionStudent.student.studentId,
          record.attendanceSessionStudent.student.fullName,
          record.status,
        ]
          .map(escape)
          .join(','),
      ),
    ].join('\n');
  }
  async statistics(
    sectionId: string,
    query: Pick<AttendanceHistoryQuery, 'dateFrom' | 'dateTo'>,
    uid: string,
    role: string,
  ) {
    await this.allowed(sectionId, uid, role);
    const session = this.sessions({ ...query, sectionId }, uid, role);
    const [expected, present, absent, late] = await this.p.$transaction([
      this.p.attendanceSessionStudent.count({ where: { attendanceSession: session } }),
      this.p.attendanceRecord.count({
        where: { status: 'PRESENT', attendanceSessionStudent: { attendanceSession: session } },
      }),
      this.p.attendanceRecord.count({
        where: { status: 'ABSENT', attendanceSessionStudent: { attendanceSession: session } },
      }),
      this.p.attendanceRecord.count({
        where: { status: 'LATE', attendanceSessionStudent: { attendanceSession: session } },
      }),
    ]);
    return calculateAttendanceStatistics({ expected, present, absent, late });
  }
  async studentHistory(
    studentId: string,
    query: Pick<AttendanceHistoryQuery, 'dateFrom' | 'dateTo'>,
    uid: string,
    role: string,
  ) {
    const session = this.sessions(query, uid, role);
    const items = await this.p.attendanceSessionStudent.findMany({
      where: { studentId, attendanceSession: session },
      include: {
        attendanceSession: { include: { section: { include: { course: true } } } },
        attendanceRecord: true,
      },
      orderBy: { attendanceSession: { date: 'desc' } },
    });
    if (!items.length) {
      const student = await this.p.student.findUnique({
        where: { id: studentId },
        select: { id: true },
      });
      if (!student) throw new AppError(404, 'Student not found');
    }
    const statistics = await this.statisticsForSessionWhere({
      ...session,
      roster: { some: { studentId } },
    });
    return { items, statistics };
  }
  private async statisticsForSessionWhere(session: Prisma.AttendanceSessionWhereInput) {
    const [expected, present, absent, late] = await this.p.$transaction([
      this.p.attendanceSessionStudent.count({ where: { attendanceSession: session } }),
      this.p.attendanceRecord.count({
        where: { status: 'PRESENT', attendanceSessionStudent: { attendanceSession: session } },
      }),
      this.p.attendanceRecord.count({
        where: { status: 'ABSENT', attendanceSessionStudent: { attendanceSession: session } },
      }),
      this.p.attendanceRecord.count({
        where: { status: 'LATE', attendanceSessionStudent: { attendanceSession: session } },
      }),
    ]);
    return calculateAttendanceStatistics({ expected, present, absent, late });
  }
}
