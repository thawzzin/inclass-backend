import { PrismaNeon } from '@prisma/adapter-neon';

import { PrismaClient } from '../generated/prisma/client.js';

const globalForPrisma = globalThis as typeof globalThis & {
  inclassPrisma?: PrismaClient;
};

function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export function getPrisma(databaseUrl: string): PrismaClient {
  globalForPrisma.inclassPrisma ??= createPrismaClient(databaseUrl);
  return globalForPrisma.inclassPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (globalForPrisma.inclassPrisma) {
    await globalForPrisma.inclassPrisma.$disconnect();
    delete globalForPrisma.inclassPrisma;
  }
}
