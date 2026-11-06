import { z } from 'zod';

const status = z.enum(['ACTIVE', 'INACTIVE']);
export const createStudentSchema = z.object({
  studentId: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(1).max(160),
  nickname: z.string().trim().min(1).max(80).nullable().optional(),
});
export const updateStudentSchema = createStudentSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field');
export const studentStatusSchema = z.object({ status });
export const studentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(160).optional(),
  status: status.optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type StudentStatusInput = z.infer<typeof studentStatusSchema>;
export type StudentListQuery = z.infer<typeof studentListQuerySchema>;
