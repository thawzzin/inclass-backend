import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';
export class AttendanceService {
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
}
