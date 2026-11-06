import { z } from 'zod';
const status = z.enum(['PRESENT', 'ABSENT', 'LATE']);
export const createSession = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export const bulkRecords = z.object({
  records: z
    .array(z.object({ studentId: z.string().uuid(), status }))
    .min(1)
    .refine((v) => new Set(v.map((x) => x.studentId)).size === v.length),
});
export const recordUpdate = z.object({ status });
export type Bulk = z.infer<typeof bulkRecords>;
export type CreateSession = z.infer<typeof createSession>;
export type RecordUpdate = z.infer<typeof recordUpdate>;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
export const attendanceHistoryQuery = z.object({
  sectionId: z.string().uuid().optional(),
  dateFrom: date,
  dateTo: date,
  status: status.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  format: z.enum(['json', 'csv']).default('json'),
});
export type AttendanceHistoryQuery = z.infer<typeof attendanceHistoryQuery>;
