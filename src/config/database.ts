import type { PrismaClient } from '../generated/prisma/client.js';

export type DatabaseCheck = () => Promise<void>;

export const checkDatabase =
  (prisma: PrismaClient): DatabaseCheck =>
  async () => {
    await prisma.$queryRaw`SELECT 1`;
  };
