import { getPrisma } from '../lib/prisma.js';

export type DatabaseCheck = () => Promise<void>;

export const checkDatabase: DatabaseCheck = async () => {
  await getPrisma().$queryRaw`SELECT 1`;
};
