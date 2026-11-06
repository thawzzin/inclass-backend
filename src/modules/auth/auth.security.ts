import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';

import type { Env } from '../../config/env.js';

const accessCookieName = 'inclass_access';
const refreshCookieName = 'inclass_refresh';
const csrfCookieName = 'inclass_csrf';

interface AccessPayload {
  userId: string;
  tokenVersion: number;
}

function accessSecret(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_ACCESS_SECRET);
}

function csrfSignature(value: string, env: Env): string {
  return createHmac('sha256', env.CSRF_SECRET).update(value).digest('base64url');
}

function secureCookieOptions(env: Env, maxAge: number, httpOnly = true): CookieOptions {
  return {
    httpOnly,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

function durationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error('Invalid access token duration');
  const amount = Number(match[1]);
  const multiplier = { s: 1, m: 60, h: 3_600, d: 86_400 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return amount * multiplier;
}

export async function signAccessToken(payload: AccessPayload, env: Env): Promise<string> {
  return new SignJWT({ tokenVersion: payload.tokenVersion })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_EXPIRES_IN)
    .sign(accessSecret(env));
}

export async function verifyAccessToken(token: string, env: Env): Promise<AccessPayload> {
  const { payload } = await jwtVerify(token, accessSecret(env), { algorithms: ['HS256'] });
  if (!payload.sub || typeof payload.tokenVersion !== 'number') throw new Error('Invalid access token payload');
  return { userId: payload.sub, tokenVersion: payload.tokenVersion };
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function setAuthCookies(response: Response, accessToken: string, refreshToken: string, env: Env): void {
  response.cookie(accessCookieName, accessToken, secureCookieOptions(env, durationSeconds(env.ACCESS_TOKEN_EXPIRES_IN) * 1_000));
  response.cookie(refreshCookieName, refreshToken, secureCookieOptions(env, env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 86_400_000));
}

export function clearAuthCookies(response: Response, env: Env): void {
  response.clearCookie(accessCookieName, secureCookieOptions(env, 0));
  response.clearCookie(refreshCookieName, secureCookieOptions(env, 0));
}

export function getAccessToken(request: Request): string | undefined {
  return request.cookies[accessCookieName] as string | undefined;
}

export function getRefreshToken(request: Request): string | undefined {
  return request.cookies[refreshCookieName] as string | undefined;
}

export function issueCsrfToken(response: Response, env: Env): string {
  const nonce = randomBytes(32).toString('base64url');
  const token = `${nonce}.${csrfSignature(nonce, env)}`;
  response.cookie(csrfCookieName, token, secureCookieOptions(env, 86_400_000, false));
  return token;
}

export function verifyCsrfToken(request: Request, env: Env): boolean {
  const cookieToken = request.cookies[csrfCookieName];
  const headerToken = request.header('x-csrf-token');
  if (typeof cookieToken !== 'string' || !headerToken || cookieToken !== headerToken) return false;
  const [nonce, signature, extra] = headerToken.split('.');
  if (!nonce || !signature || extra) return false;
  const expected = csrfSignature(nonce, env);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}
