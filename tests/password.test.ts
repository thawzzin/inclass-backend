import { describe, expect, it, vi } from 'vitest';

import { hashPassword, isPasswordLengthValid, verifyPassword } from '../src/lib/password.js';

describe('Worker password handling', () => {
  it('rejects passwords beyond bcrypt’s UTF-8 byte limit', () => {
    expect(isPasswordLengthValid('a'.repeat(72))).toBe(true);
    expect(isPasswordLengthValid('é'.repeat(37))).toBe(false);
  });

  it('requests bcrypt hashing from the database', async () => {
    const query = vi.fn().mockResolvedValue([{ hash: '$2a$12$hash' }]);
    const prisma = { $queryRaw: query } as never;
    expect(await hashPassword(prisma, 'StrongPassword123!')).toBe('$2a$12$hash');
    expect(query).toHaveBeenCalledOnce();
  });

  it('does not treat an old Argon2 hash as a valid bcrypt password', async () => {
    const query = vi.fn();
    const prisma = { $queryRaw: query } as never;
    expect(await verifyPassword(prisma, 'password', '$argon2id$v=19$hash')).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
