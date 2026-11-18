import type { PrismaClient } from '../generated/prisma/client.js';

const bcryptHash = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function isPasswordLengthValid(password: string): boolean {
  return new TextEncoder().encode(password).length <= 72;
}

export function validatePasswordLength(password: string): void {
  if (!isPasswordLengthValid(password)) {
    throw new Error('Password must be at most 72 UTF-8 bytes');
  }
}

export async function hashPassword(prisma: PrismaClient, password: string): Promise<string> {
  validatePasswordLength(password);
  const rows = await prisma.$queryRaw<Array<{ hash: string }>>`
    SELECT crypt(${password}, gen_salt('bf', 12)) AS hash
  `;
  if (!rows[0]?.hash) throw new Error('Password hashing failed');
  return rows[0].hash;
}

export async function verifyPassword(
  prisma: PrismaClient,
  password: string,
  hash: string,
): Promise<boolean> {
  if (!bcryptHash.test(hash)) return false;
  validatePasswordLength(password);
  const rows = await prisma.$queryRaw<Array<{ valid: boolean }>>`
    SELECT crypt(${password}, ${hash}) = ${hash} AS valid
  `;
  return rows[0]?.valid === true;
}
