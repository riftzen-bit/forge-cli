import { hasToken, loadProviderKey, loadToken } from '../config/tokenStore.js';
import { loadSettings } from '../config/settings.js';
import { DEFAULT_PROVIDER, providerFor } from '../agent/providers.js';
import { hasCodexLogin } from './codexCli.js';

export type AuthKind = 'oauth' | 'apikey' | 'session' | 'none';
export type AuthStatus = { kind: AuthKind };

export async function detectAuth(): Promise<AuthStatus> {
  const settings = await loadSettings();
  const active = settings.activeProvider ?? DEFAULT_PROVIDER;
  const provider = providerFor(active);
  if (provider.runtime === 'codex-cli') {
    return hasCodexLogin() ? { kind: 'session' } : { kind: 'none' };
  }
  if (active === DEFAULT_PROVIDER) {
    const tok = await loadToken();
    if (!tok) return { kind: 'none' };
    return { kind: classifyAnthropicToken(tok) };
  }
  const key = await loadProviderKey(active);
  if (key) return { kind: 'apikey' };
  if (await hasToken()) {
    const tok = await loadToken();
    return { kind: tok ? classifyAnthropicToken(tok) : 'none' };
  }
  return { kind: 'none' };
}

// `sk-ant-oat...` is the OAuth-issued token shape printed by `claude
// setup-token`. Anything else (sk-ant-api...) is a static API key.
function classifyAnthropicToken(tok: string): 'oauth' | 'apikey' {
  return tok.startsWith('sk-ant-oat') ? 'oauth' : 'apikey';
}

export function authBadge(a: AuthStatus): { label: string; color: 'green' | 'red' } {
  if (a.kind === 'oauth')  return { label: 'oauth', color: 'green' };
  if (a.kind === 'apikey') return { label: 'api key', color: 'green' };
  if (a.kind === 'session') return { label: 'session', color: 'green' };
  return { label: 'not signed in', color: 'red' };
}
