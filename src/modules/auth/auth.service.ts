import type { PrismaClient } from '../../generated/prisma/client.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

import type { Env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import type { PasswordChangeInput, LoginInput, ProfileInput } from './auth.schemas.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from './auth.security.js';
import type { AuthSessionResult, AuthUser } from './auth.types.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  tokenVersion: true,
} as const;

type DatabaseUser = AuthUser & { tokenVersion: number };

export interface AuthServiceContract {
  authenticate(accessToken: string): Promise<AuthUser>;
  login(input: LoginInput): Promise<AuthSessionResult>;
  refresh(refreshToken: string): Promise<AuthSessionResult>;
  logout(refreshToken: string | undefined): Promise<void>;
  updateProfile(
    userId: string,
    input: ProfileInput,
  ): Promise<Partial<AuthSessionResult> & { user: AuthUser }>;
  changePassword(userId: string, input: PasswordChangeInput): Promise<void>;
}

export class AuthService implements AuthServiceContract {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {}

  public async authenticate(accessToken: string): Promise<AuthUser> {
    try {
      const payload = await verifyAccessToken(accessToken, this.env);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: userSelect,
      });
      if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== payload.tokenVersion) {
        throw new AppError(401, 'Authentication is invalid or expired');
      }
      return this.toAuthUser(user);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(401, 'Authentication is invalid or expired');
    }
  }

  public async login(input: LoginInput): Promise<AuthSessionResult> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const validPassword = user
      ? await verifyPassword(this.prisma, input.password, user.passwordHash)
      : false;
    if (!user || !validPassword || user.status !== 'ACTIVE') {
      throw new AppError(401, 'Invalid email or password');
    }

    const refreshToken = generateRefreshToken();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      const current = await transaction.user.findUnique({
        where: { id: user.id },
        select: { ...userSelect, passwordHash: true },
      });
      if (!current || current.status !== 'ACTIVE' || current.passwordHash !== user.passwordHash) {
        throw new AppError(401, 'Invalid email or password');
      }
      await transaction.refreshSession.create({
        data: {
          userId: current.id,
          tokenHash: hashRefreshToken(refreshToken),
          expiresAt: this.refreshExpiry(new Date()),
        },
      });
      return this.sessionResult(current, refreshToken);
    });
  }

  public async refresh(refreshToken: string): Promise<AuthSessionResult> {
    const tokenHash = hashRefreshToken(refreshToken);
    const now = new Date();
    const rotatedToken = generateRefreshToken();
    const rotatedHash = hashRefreshToken(rotatedToken);
    const expiresAt = this.refreshExpiry(now);

    const result = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.refreshSession.findUnique({
        where: { tokenHash },
        include: { user: { select: userSelect } },
      });
      if (!session || session.expiresAt <= now || session.user.status !== 'ACTIVE') {
        throw new AppError(401, 'Refresh session is invalid or expired');
      }
      if (session.revokedAt) {
        await transaction.refreshSession.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { reused: true as const };
      }

      const revoked = await transaction.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) {
        await transaction.refreshSession.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { reused: true as const };
      }

      await transaction.refreshSession.create({
        data: { userId: session.userId, tokenHash: rotatedHash, expiresAt },
      });
      return { reused: false as const, user: session.user };
    });

    if (result.reused) throw new AppError(401, 'Refresh session is invalid or expired');
    return this.sessionResult(result.user, rotatedToken);
  }

  public async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  public async updateProfile(
    userId: string,
    input: ProfileInput,
  ): Promise<Partial<AuthSessionResult> & { user: AuthUser }> {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    if (!current || current.status !== 'ACTIVE')
      throw new AppError(401, 'Authentication is invalid or expired');

    const email = input.email?.toLowerCase();
    const changingEmail = email !== undefined && email !== current.email;
    const refreshToken = changingEmail ? generateRefreshToken() : undefined;

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.user.update({
          where: { id: userId },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(email === undefined ? {} : { email }),
            ...(changingEmail ? { tokenVersion: { increment: 1 } } : {}),
          },
          select: userSelect,
        });
        if (changingEmail) {
          await transaction.refreshSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await transaction.refreshSession.create({
            data: {
              userId,
              tokenHash: hashRefreshToken(refreshToken as string),
              expiresAt: this.refreshExpiry(new Date()),
            },
          });
        }
        return updated;
      });

      if (!refreshToken) return { user: this.toAuthUser(user) };
      return this.sessionResult(user, refreshToken);
    } catch (error) {
      if (this.isUniqueConstraint(error))
        throw new AppError(409, 'Email address is already in use');
      throw error;
    }
  }

  public async changePassword(userId: string, input: PasswordChangeInput): Promise<void> {
    if (input.currentPassword === input.newPassword)
      throw new AppError(422, 'New password must be different');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user || !(await verifyPassword(this.prisma, input.currentPassword, user.passwordHash))) {
      throw new AppError(401, 'Current password is incorrect');
    }

    const passwordHash = await hashPassword(this.prisma, input.newPassword);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await transaction.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async sessionResult(
    user: DatabaseUser,
    refreshToken: string,
  ): Promise<AuthSessionResult> {
    return {
      user: this.toAuthUser(user),
      accessToken: await signAccessToken(
        { userId: user.id, tokenVersion: user.tokenVersion },
        this.env,
      ),
      refreshToken,
    };
  }

  private refreshExpiry(from: Date): Date {
    return new Date(from.getTime() + this.env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 86_400_000);
  }

  private toAuthUser(user: DatabaseUser): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  private isUniqueConstraint(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
