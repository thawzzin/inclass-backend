import { z } from 'zod';
const text = z.string().trim().min(1).max(120);
const status = z.enum(['ACTIVE', 'INACTIVE']);
export const courseCreate = z.object({ code: z.string().trim().min(1).max(32), name: text });
export const courseUpdate = courseCreate.partial().refine((v) => Object.keys(v).length > 0);
export const sectionCreate = z.object({
  courseId: z.string().uuid(),
  sectionCode: z.string().trim().min(1).max(32),
  teacherId: z.string().uuid(),
});
export const sectionUpdate = z
  .object({ sectionCode: z.string().trim().min(1).max(32).optional() })
  .refine((v) => Object.keys(v).length > 0);
export const assignment = z.object({ teacherId: z.string().uuid() });
export const statusSchema = z.object({ status });
export type CourseCreate = z.infer<typeof courseCreate>;
export type CourseUpdate = z.infer<typeof courseUpdate>;
export type SectionCreate = z.infer<typeof sectionCreate>;
export type SectionUpdate = z.infer<typeof sectionUpdate>;
export type Assignment = z.infer<typeof assignment>;
export type Status = z.infer<typeof statusSchema>;
