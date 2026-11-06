import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { calculateAttendanceStatistics } from '../attendance/attendance.statistics.js';

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}
  private sectionWhere(userId: string, role: string): Prisma.SectionWhereInput {
    return role === 'ADMIN' ? {} : { teacherId: userId };
  }
  private sessionWhere(userId: string, role: string): Prisma.AttendanceSessionWhereInput {
    return role === 'ADMIN' ? {} : { section: { teacherId: userId } };
  }
  async summary(userId: string, role: string) {
    const sections = this.sectionWhere(userId, role);
    const sessions = this.sessionWhere(userId, role);
    if (role === 'ADMIN') {
      const [students, teachers, courses, activeSections, attendanceSessions] =
        await this.prisma.$transaction([
          this.prisma.student.count({ where: { status: 'ACTIVE' } }),
          this.prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
          this.prisma.course.count({ where: { status: 'ACTIVE' } }),
          this.prisma.section.count({ where: { status: 'ACTIVE' } }),
          this.prisma.attendanceSession.count(),
        ]);
      return {
        activeStudents: students,
        activeTeachers: teachers,
        activeCourses: courses,
        activeSections,
        attendanceSessions,
      };
    }
    const [assignedSections, students, attendanceSessions] = await this.prisma.$transaction([
      this.prisma.section.count({ where: sections }),
      this.prisma.student.count({
        where: { status: 'ACTIVE', enrollments: { some: { section: sections } } },
      }),
      this.prisma.attendanceSession.count({ where: sessions }),
    ]);
    return { assignedSections, activeStudents: students, attendanceSessions };
  }
  async attendanceStats(userId: string, role: string) {
    const sessions = this.sessionWhere(userId, role);
    const recordWhere = { attendanceSessionStudent: { attendanceSession: sessions } };
    const [expected, present, absent, late] = await this.prisma.$transaction([
      this.prisma.attendanceSessionStudent.count({ where: { attendanceSession: sessions } }),
      this.prisma.attendanceRecord.count({ where: { ...recordWhere, status: 'PRESENT' } }),
      this.prisma.attendanceRecord.count({ where: { ...recordWhere, status: 'ABSENT' } }),
      this.prisma.attendanceRecord.count({ where: { ...recordWhere, status: 'LATE' } }),
    ]);
    return calculateAttendanceStatistics({ expected, present, absent, late });
  }
  async recentAttendance(userId: string, role: string) {
    return this.prisma.attendanceSession.findMany({
      where: this.sessionWhere(userId, role),
      include: {
        section: { include: { course: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { roster: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }
}
