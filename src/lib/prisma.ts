import { AsyncLocalStorage } from 'node:async_hooks';

import { PrismaNeon } from '@prisma/adapter-neon';

import { PrismaClient } from '../generated/prisma/client.js';

const globalForPrisma = globalThis as typeof globalThis & {
  inclassPrisma?: PrismaClient;
};
const requestPrisma = new AsyncLocalStorage<PrismaClient>();

function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export function getPrisma(databaseUrl: string): PrismaClient {
  const scopedPrisma = requestPrisma.getStore();
  if (scopedPrisma) return scopedPrisma;

  globalForPrisma.inclassPrisma ??= createPrismaClient(databaseUrl);
  return globalForPrisma.inclassPrisma;
}

export const requestPrismaProxy = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const prisma = requestPrisma.getStore();
    if (!prisma) throw new Error('Prisma request scope is unavailable');
    const value: unknown = Reflect.get(prisma, property, prisma);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(prisma)
      : value;
  },
});

export async function withRequestPrisma<T>(
  databaseUrl: string,
  callback: () => Promise<T>,
): Promise<T> {
  const prisma = createPrismaClient(databaseUrl);
  return requestPrisma.run(prisma, async () => {
    try {
      return await callback();
    } finally {
      await prisma.$disconnect();
    }
  });
}

export async function disconnectPrisma(): Promise<void> {
  if (globalForPrisma.inclassPrisma) {
    await globalForPrisma.inclassPrisma.$disconnect();
    delete globalForPrisma.inclassPrisma;
  }
}
