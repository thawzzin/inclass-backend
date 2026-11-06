export type AuthRole = 'ADMIN' | 'TEACHER';
export type AuthStatus = 'ACTIVE' | 'INACTIVE';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  status: AuthStatus;
}

export interface AuthSessionResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}
