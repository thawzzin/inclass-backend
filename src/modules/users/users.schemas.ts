import { z } from 'zod';

const password = z.string().min(12).max(128);
const email = z.string().trim().email().max(320);
const name = z.string().trim().min(1).max(120);

export const createTeacherSchema = z.object({ name, email, password });
export const updateTeacherSchema = z.object({ name: name.optional(), email: email.optional() }).refine((value) => value.name !== undefined || value.email !== undefined, 'Provide at least one field');
export const statusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });
export const teacherPasswordSchema = z.object({ password });
export const teacherListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(320).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;
export type TeacherStatusInput = z.infer<typeof statusSchema>;
export type TeacherPasswordInput = z.infer<typeof teacherPasswordSchema>;
export type TeacherListQuery = z.infer<typeof teacherListQuerySchema>;
