import { z } from 'zod';

const password = z.string().min(6).max(128);

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password,
});

export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(320).optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.email !== undefined,
    'Provide at least one field',
  );

export const passwordChangeSchema = z.object({
  currentPassword: password,
  newPassword: password,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
