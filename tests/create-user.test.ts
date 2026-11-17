import { describe, expect, it } from 'vitest';

import {
  createInitialAdmin,
  formatCreateUserError,
  initialAdminTransactionOptions,
  InitialAdminAlreadyExistsError,
  type InitialAdminCreate,
  type InitialAdminRecord,
  type InitialAdminRepository,
} from '../src/cli/create-user.js';

class MemoryAdminRepository implements InitialAdminRepository {
  public created: InitialAdminCreate | null = null;

  public constructor(private readonly existingAdmin = false) {}

  public async createIfNone(input: InitialAdminCreate): Promise<InitialAdminRecord | null> {
    if (this.existingAdmin) return null;
    this.created = input;
    return { id: 'admin-1', name: input.name, email: input.email };
  }
}

describe('createInitialAdmin', () => {
  it('normalizes the account and stores only a password hash', async () => {
    const repository = new MemoryAdminRepository();

    const user = await createInitialAdmin(
      {
        name: '  Initial Admin  ',
        email: '  ADMIN@EXAMPLE.COM  ',
        password: 'StrongPassword123!',
        passwordConfirmation: 'StrongPassword123!',
      },
      repository,
      async (password) => `argon2:${password}`,
    );

    expect(user).toEqual({ id: 'admin-1', name: 'Initial Admin', email: 'admin@example.com' });
    expect(repository.created).toEqual({
      name: 'Initial Admin',
      email: 'admin@example.com',
      passwordHash: 'argon2:StrongPassword123!',
    });
    expect(repository.created).not.toHaveProperty('password');
  });

  it('refuses to create another administrator', async () => {
    const repository = new MemoryAdminRepository(true);

    await expect(
      createInitialAdmin(
        {
          name: 'Second Admin',
          email: 'second@example.com',
          password: 'StrongPassword123!',
          passwordConfirmation: 'StrongPassword123!',
        },
        repository,
        async () => 'password-hash',
      ),
    ).rejects.toBeInstanceOf(InitialAdminAlreadyExistsError);

    expect(repository.created).toBeNull();
  });

  it.each([
    {
      label: 'a weak password',
      input: {
        name: 'Initial Admin',
        email: 'admin@example.com',
        password: 'short',
        passwordConfirmation: 'short',
      },
    },
    {
      label: 'a mismatched confirmation',
      input: {
        name: 'Initial Admin',
        email: 'admin@example.com',
        password: 'StrongPassword123!',
        passwordConfirmation: 'DifferentPassword123!',
      },
    },
  ])('rejects $label before writing to the database', async ({ input }) => {
    const repository = new MemoryAdminRepository();

    await expect(
      createInitialAdmin(input, repository, async () => 'password-hash'),
    ).rejects.toThrow();

    expect(repository.created).toBeNull();
  });
});

describe('formatCreateUserError', () => {
  it('does not expose unexpected database error details', () => {
    const error = new Error(
      'connection failed for postgresql://secret-user:secret-password@secret-host/database',
    );

    expect(formatCreateUserError(error)).toBe(
      'Unable to create the initial administrator. Check the database connection and try again.',
    );
  });

  it('explains when an administrator already exists', () => {
    expect(formatCreateUserError(new InitialAdminAlreadyExistsError())).toBe(
      'An administrator already exists. Use the application to manage accounts.',
    );
  });
});

describe('initial admin transaction policy', () => {
  it('allows enough time for a serverless database connection to start', () => {
    expect(initialAdminTransactionOptions).toEqual({
      isolationLevel: 'Serializable',
      maxWait: 30_000,
      timeout: 10_000,
    });
  });
});
