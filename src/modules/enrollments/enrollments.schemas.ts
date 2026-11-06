import { z } from 'zod';
export const enrollmentSchema = z.object({ studentId: z.string().uuid() });
export const bulkEnrollmentSchema = z.object({
  studentIds: z
    .array(z.string().uuid())
    .min(1)
    .max(500)
    .refine((v) => new Set(v).size === v.length, 'Student IDs must be unique'),
});
export type EnrollmentInput = z.infer<typeof enrollmentSchema>;
export type BulkEnrollmentInput = z.infer<typeof bulkEnrollmentSchema>;
