import argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';

import { convertPasswordForUser } from '../src/cli/convert-password.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

describe('offline password conversion', () => {
  it('verifies the current Argon2id password before replacing its hash', async () => {
    const password = 'CurrentPassword123!';
    const oldHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 1024 });
    const update = vi.fn();
    const revoke = vi.fn();
    const query = vi.fn().mockResolvedValue([{ hash: '$2a$12$replacement' }]);
    const transaction = { user: { update }, refreshSession: { updateMany: revoke } };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', passwordHash: oldHash }) },
      $queryRaw: query,
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;

    await convertPasswordForUser(prisma, 'admin@example.com', password);
    expect(query.mock.calls[0]?.[1]).toBe(password);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', passwordHash: oldHash },
      }),
    );
    expect(revoke).toHaveBeenCalledOnce();
    await expect(convertPasswordForUser(prisma, 'admin@example.com', 'wrong')).rejects.toThrow(
      'Account or current password is invalid',
    );
    expect(update).toHaveBeenCalledOnce();
  });
});
