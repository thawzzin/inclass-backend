import 'dotenv/config';

import argon2 from 'argon2';
import { PrismaNeon } from '@prisma/adapter-neon';

import { PrismaClient } from '../src/generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the database');
if (process.env.NODE_ENV === 'production')
  throw new Error('Refusing to seed when NODE_ENV=production');

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: databaseUrl }) });
const passwordOptions = { type: argon2.argon2id } as const;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'replace-with-development-password';
  const adminHash = await argon2.hash(adminPassword, passwordOptions);
  const teacherHash = await argon2.hash('TeacherPassword123!', passwordOptions);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: 'InClass Administrator',
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash: adminHash,
    },
    create: {
      name: 'InClass Administrator',
      email: adminEmail,
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });
  const teacherOne = await prisma.user.upsert({
    where: { email: 'teacher.one@example.com' },
    update: { name: 'Teacher One', role: 'TEACHER', status: 'ACTIVE', passwordHash: teacherHash },
    create: {
      name: 'Teacher One',
      email: 'teacher.one@example.com',
      passwordHash: teacherHash,
      role: 'TEACHER',
    },
  });
  const teacherTwo = await prisma.user.upsert({
    where: { email: 'teacher.two@example.com' },
    update: { name: 'Teacher Two', role: 'TEACHER', status: 'ACTIVE', passwordHash: teacherHash },
    create: {
      name: 'Teacher Two',
      email: 'teacher.two@example.com',
      passwordHash: teacherHash,
      role: 'TEACHER',
    },
  });
  const course = await prisma.course.upsert({
    where: { code: 'CSC480' },
    update: { name: 'Software Engineering', status: 'ACTIVE' },
    create: { code: 'CSC480', name: 'Software Engineering' },
  });
  const sections = await Promise.all(
    ['901', '902', '903'].map((sectionCode, index) =>
      prisma.section.upsert({
        where: { courseId_sectionCode: { courseId: course.id, sectionCode } },
        update: { teacherId: index === 2 ? teacherTwo.id : teacherOne.id, status: 'ACTIVE' },
        create: {
          courseId: course.id,
          sectionCode,
          teacherId: index === 2 ? teacherTwo.id : teacherOne.id,
        },
      }),
    ),
  );
  const students = await Promise.all(
    Array.from({ length: 18 }, (_, index) => {
      const number = String(index + 1).padStart(2, '0');
      return prisma.student.upsert({
        where: { studentId: `650000${number}` },
        update: {
          fullName: `Sample Student ${number}`,
          nickname: index % 3 === 0 ? `Student ${number}` : null,
          status: 'ACTIVE',
        },
        create: {
          studentId: `650000${number}`,
          fullName: `Sample Student ${number}`,
          nickname: index % 3 === 0 ? `Student ${number}` : null,
        },
      });
    }),
  );
  for (const section of sections) {
    await prisma.enrollment.createMany({
      data: students.map((student) => ({ studentId: student.id, sectionId: section.id })),
      skipDuplicates: true,
    });
  }
  for (const sessionDate of ['2026-11-02', '2026-11-04', '2026-11-06']) {
    const session = await prisma.attendanceSession.upsert({
      where: { sectionId_date: { sectionId: sections[0]!.id, date: date(sessionDate) } },
      update: {},
      create: { sectionId: sections[0]!.id, date: date(sessionDate), createdById: admin.id },
    });
    await prisma.attendanceSessionStudent.createMany({
      data: students.map((student) => ({ attendanceSessionId: session.id, studentId: student.id })),
      skipDuplicates: true,
    });
    await prisma.attendanceRecord.createMany({
      data: students.slice(0, 12).map((student, index) => ({
        attendanceSessionId: session.id,
        studentId: student.id,
        status: index % 5 === 0 ? 'LATE' : index % 4 === 0 ? 'ABSENT' : 'PRESENT',
      })),
      skipDuplicates: true,
    });
  }
  console.log(
    `Seeded ${students.length} students, ${sections.length} sections, and sample attendance. Admin: ${admin.email}`,
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
