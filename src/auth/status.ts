import { hasToken } from '../config/tokenStore.js';

export type AuthStatus = { kind: 'token' } | { kind: 'none' };

export async function detectAuth(): Promise<AuthStatus> {
  return (await hasToken()) ? { kind: 'token' } : { kind: 'none' };
}

export function authBadge(a: AuthStatus): { label: string; color: 'green' | 'red' } {
  return a.kind === 'token'
    ? { label: 'token set', color: 'green' }
    : { label: 'not signed in', color: 'red' };
}
