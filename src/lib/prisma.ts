import { PrismaNeon } from '@prisma/adapter-neon';

import { getEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

const globalForPrisma = globalThis as typeof globalThis & {
  inclassPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: getEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  globalForPrisma.inclassPrisma ??= createPrismaClient();
  return globalForPrisma.inclassPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (globalForPrisma.inclassPrisma) {
    await globalForPrisma.inclassPrisma.$disconnect();
    delete globalForPrisma.inclassPrisma;
  }
}
