import 'dotenv/config';

import argon2 from 'argon2';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { disconnectPrisma, getPrisma } from '../lib/prisma.js';

const initialAdminSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    email: z.string().trim().email('Enter a valid email address').max(320),
    password: z.string().min(6, 'Password must contain at least 12 characters').max(128),
    passwordConfirmation: z.string(),
  })
  .refine((input) => input.password === input.passwordConfirmation, {
    message: 'Password confirmation does not match',
    path: ['passwordConfirmation'],
  });

export interface InitialAdminInput {
  name: string;
  email: string;
  password: string;
  passwordConfirmation: string;
}

export interface InitialAdminCreate {
  name: string;
  email: string;
  passwordHash: string;
}

export interface InitialAdminRecord {
  id: string;
  name: string;
  email: string;
}

export interface InitialAdminRepository {
  createIfNone(input: InitialAdminCreate): Promise<InitialAdminRecord | null>;
}

export class InitialAdminAlreadyExistsError extends Error {
  public constructor() {
    super('An administrator already exists. Use the application to manage accounts.');
    this.name = 'InitialAdminAlreadyExistsError';
  }
}

class CreateUserUsageError extends Error {
  public override readonly name = 'CreateUserUsageError';
}

export function formatCreateUserError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const messages = error.issues.map((issue) => `- ${issue.message}`).join('\n');
    return `Invalid account details:\n${messages}`;
  }
  if (error instanceof InitialAdminAlreadyExistsError || error instanceof CreateUserUsageError) {
    return error.message;
  }
  return 'Unable to create the initial administrator. Check the database connection and try again.';
}

type PasswordHasher = (password: string) => Promise<string>;

const hashPassword: PasswordHasher = (password) => argon2.hash(password, { type: argon2.argon2id });

export const initialAdminTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 30_000,
  timeout: 10_000,
} as const;

export async function createInitialAdmin(
  input: InitialAdminInput,
  repository: InitialAdminRepository,
  hasher: PasswordHasher = hashPassword,
): Promise<InitialAdminRecord> {
  const parsed = initialAdminSchema.parse(input);
  const created = await repository.createIfNone({
    name: parsed.name,
    email: parsed.email.toLowerCase(),
    passwordHash: await hasher(parsed.password),
  });

  if (!created) throw new InitialAdminAlreadyExistsError();
  return created;
}

class PrismaInitialAdminRepository implements InitialAdminRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public createIfNone(input: InitialAdminCreate): Promise<InitialAdminRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const adminCount = await transaction.user.count({ where: { role: 'ADMIN' } });
      if (adminCount > 0) return null;

      return transaction.user.create({
        data: { ...input, role: 'ADMIN' },
        select: { id: true, name: true, email: true },
      });
    }, initialAdminTransactionOptions);
  }
}

class TerminalPrompter {
  private muted = false;
  private readonly mutedOutput = new Writable({
    write: (chunk: string | Buffer, _encoding, callback) => {
      if (!this.muted) process.stdout.write(chunk);
      callback();
    },
  });
  private readonly terminal = createInterface({
    input: process.stdin,
    output: this.mutedOutput,
    terminal: true,
  });

  public question(prompt: string): Promise<string> {
    return this.terminal.question(prompt);
  }

  public async secret(prompt: string): Promise<string> {
    process.stdout.write(prompt);
    this.muted = true;
    try {
      return await this.terminal.question('');
    } finally {
      this.muted = false;
      process.stdout.write('\n');
    }
  }

  public close(): void {
    this.terminal.close();
  }
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new CreateUserUsageError('user:create requires an interactive terminal');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new CreateUserUsageError('DATABASE_URL is required');

  const prompt = new TerminalPrompter();
  try {
    process.stdout.write('Create the initial InClass administrator\n\n');
    const name = await prompt.question('Name: ');
    const email = await prompt.question('Email: ');
    const password = await prompt.secret('Password: ');
    const passwordConfirmation = await prompt.secret('Confirm password: ');
    const confirmation = await prompt.question(
      `\nCreate ADMIN account for ${email.trim().toLowerCase()}? [y/N] `,
    );

    if (!['y', 'yes'].includes(confirmation.trim().toLowerCase())) {
      process.stdout.write('Cancelled. No account was created.\n');
      return;
    }

    const repository = new PrismaInitialAdminRepository(getPrisma(databaseUrl));
    const user = await createInitialAdmin(
      { name, email, password, passwordConfirmation },
      repository,
    );
    process.stdout.write(`Initial administrator created: ${user.email}\n`);
  } finally {
    prompt.close();
    await disconnectPrisma();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${formatCreateUserError(error)}\n`);
    process.exitCode = 1;
  });
}
