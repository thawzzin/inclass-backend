import { getPrisma } from '../lib/prisma.js';
import { getEnv } from './env.js';

export type DatabaseCheck = () => Promise<void>;

export const checkDatabase: DatabaseCheck = async () => {
  await getPrisma(getEnv().DATABASE_URL).$queryRaw`SELECT 1`;
};
