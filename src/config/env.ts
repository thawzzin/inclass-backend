import { z } from 'zod';

const postgresSslUrl = (name: string) =>
  z.string().superRefine((value, context) => {
    try {
      const url = new URL(value);
      const validProtocol = url.protocol === 'postgresql:' || url.protocol === 'postgres:';
      const sslMode = url.searchParams.get('sslmode');

      if (!validProtocol || (sslMode !== 'require' && sslMode !== 'verify-full')) {
        context.addIssue({
          code: 'custom',
          message: `${name} must be a PostgreSQL URL with sslmode=require or sslmode=verify-full`,
        });
      }
    } catch {
      context.addIssue({ code: 'custom', message: `${name} must be a valid URL` });
    }
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: postgresSslUrl('DATABASE_URL'),
  DIRECT_URL: postgresSslUrl('DIRECT_URL'),
  TEST_DATABASE_URL: postgresSslUrl('TEST_DATABASE_URL').optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must contain at least 32 characters'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'Invalid access token duration'),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().positive(),
  FRONTEND_URL: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }

  return result.data;
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}
