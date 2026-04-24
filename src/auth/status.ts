import { hasToken, loadProviderKey } from '../config/tokenStore.js';
import { loadSettings } from '../config/settings.js';
import { DEFAULT_PROVIDER } from '../agent/providers.js';

export type AuthStatus = { kind: 'token' } | { kind: 'none' };

export async function detectAuth(): Promise<AuthStatus> {
  const settings = await loadSettings();
  const active = settings.activeProvider ?? DEFAULT_PROVIDER;
  if (active === DEFAULT_PROVIDER) {
    return (await hasToken()) ? { kind: 'token' } : { kind: 'none' };
  }
  const key = await loadProviderKey(active);
  if (key) return { kind: 'token' };
  if (await hasToken()) return { kind: 'token' };
  return { kind: 'none' };
}

export function authBadge(a: AuthStatus): { label: string; color: 'green' | 'red' } {
  return a.kind === 'token'
    ? { label: 'key set', color: 'green' }
    : { label: 'not signed in', color: 'red' };
}
