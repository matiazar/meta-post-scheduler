export const SESSION_COOKIE = 'sp_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const IS_PUBLIC_KEY = 'isPublic';

export interface SessionUser {
  email: string;
}
