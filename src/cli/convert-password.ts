import 'dotenv/config';

import argon2 from 'argon2';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { PrismaClient } from '../generated/prisma/client.js';
import { TerminalPrompter } from './create-user.js';
import { disconnectPrisma, getPrisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';

export async function convertPasswordForUser(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  if (
    !user ||
    !user.passwordHash.startsWith('$argon2') ||
    !(await argon2.verify(user.passwordHash, password))
  ) {
    throw new Error('Account or current password is invalid');
  }
  const passwordHash = await hashPassword(prisma, password);
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: user.id, passwordHash: user.passwordHash },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await transaction.refreshSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Interactive terminal required');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const prompt = new TerminalPrompter();
  try {
    const email = (await prompt.question('Account email: ')).trim().toLowerCase();
    const password = await prompt.secret('Current password: ');
    await convertPasswordForUser(getPrisma(databaseUrl), email, password);
    process.stdout.write(`Password converted for ${email}. Existing sessions revoked.\n`);
  } finally {
    prompt.close();
    await disconnectPrisma();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error &&
      [
        'Interactive terminal required',
        'DATABASE_URL is required',
        'Account or current password is invalid',
        'Password must be at most 72 UTF-8 bytes',
      ].includes(error.message)
        ? error.message
        : 'Password conversion failed. Check the database and migrations.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
