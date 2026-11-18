import 'dotenv/config';

import { getPrisma, disconnectPrisma } from '../lib/prisma.js';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  try {
    const count = await getPrisma(databaseUrl).user.count({
      where: { passwordHash: { startsWith: '$argon2' } },
    });
    process.stdout.write(`${count} account(s) still require a password reset.\n`);
    if (count > 0) process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error && error.message === 'DATABASE_URL is required' ? error.message : 'Password status failed. Check the database connection.'}\n`,
  );
  process.exitCode = 1;
});
