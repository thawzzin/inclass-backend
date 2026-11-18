import 'dotenv/config';

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { TerminalPrompter } from './create-user.js';
import { disconnectPrisma, getPrisma } from '../lib/prisma.js';
import { hashPassword, isPasswordLengthValid } from '../lib/password.js';

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Interactive terminal required');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const prompt = new TerminalPrompter();
  try {
    const email = (await prompt.question('Account email: ')).trim().toLowerCase();
    const password = await prompt.secret('New password: ');
    const confirmation = await prompt.secret('Confirm password: ');
    if (password !== confirmation || password.length < 12 || !isPasswordLengthValid(password)) {
      throw new Error('Passwords must match and contain 12–72 UTF-8 bytes');
    }
    const answer = await prompt.question(`Reset password for ${email}? [y/N] `);
    if (!['y', 'yes'].includes(answer.trim().toLowerCase())) return;

    const prisma = getPrisma(databaseUrl);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error('Account not found');
    const passwordHash = await hashPassword(prisma, password);
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await transaction.refreshSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    process.stdout.write(`Password reset for ${email}. Existing sessions revoked.\n`);
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
        'Account not found',
        'Passwords must match and contain 12–72 UTF-8 bytes',
      ].includes(error.message)
        ? error.message
        : 'Password reset failed. Check the database and migrations.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
