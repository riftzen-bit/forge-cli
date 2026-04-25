// In-session /login picker. Three phases:
//   1. provider — pick which provider to authenticate
//   2. method   — pick OAuth (browser) or API key
//   3. input    — paste API key (and base URL if non-native or 'custom')
//
// OAuth is wired today only for Anthropic (uses `claude setup-token` via the
// existing onRequestOAuth callback, which exits Ink, runs the binary, and
// re-launches the chat). For other providers the OAuth option surfaces a
// "not yet supported" hint and falls back to the API-key flow.

import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { SimpleTextInput } from './SimpleTextInput.js';
import { PROVIDERS, validateKey, type ProviderId } from '../agent/providers.js';
import { saveProviderKey } from '../config/tokenStore.js';
import { saveSettings } from '../config/settings.js';
import { getTheme } from '../ui/theme.js';

type Phase = 'pick' | 'method' | 'baseurl' | 'key' | 'saving' | 'done' | 'error';
type Method = 'oauth' | 'apikey';

type Props = {
  initialProvider?: string;
  onDone: (msg: string) => void;
  onCancel: () => void;
  onRequestOAuth?: () => void;
};

const OAUTH_NATIVE = new Set(['anthropic']);

export function LoginPicker({ initialProvider, onDone, onCancel, onRequestOAuth }: Props) {
  const t = getTheme();
  const [cursor, setCursor] = useState(() => {
    if (initialProvider) {
      const i = PROVIDERS.findIndex((p) => p.id === initialProvider);
      return i >= 0 ? i : 0;
    }
    return 0;
  });
  const [phase, setPhase] = useState<Phase>(initialProvider ? 'method' : 'pick');
  const [methodCursor, setMethodCursor] = useState(0);
  const [baseURL, setBaseURL] = useState('');
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
  }, []);

  const provider = PROVIDERS[cursor]!;
  const oauthSupported = OAUTH_NATIVE.has(provider.id);

  const methodOptions: { id: Method; label: string; hint: string }[] = [
    {
      id: 'oauth',
      label: 'OAuth (browser)',
      hint: oauthSupported
        ? 'opens claude setup-token (Anthropic)'
        : 'not yet supported for this provider — use API key',
    },
    { id: 'apikey', label: 'API key', hint: 'paste a static key' },
  ];

  function startInputForKey(): void {
    if (provider.id === 'custom' || !provider.nativeAnthropic) {
      setBaseURL(provider.baseURL);
      setPhase('baseurl');
    } else {
      setPhase('key');
    }
  }

  async function chooseMethod(): Promise<void> {
    const m = methodOptions[methodCursor]!;
    if (m.id === 'oauth') {
      if (!oauthSupported) {
        setMessage(`OAuth not yet implemented for ${provider.label}. Falling back to API key.`);
        setPhase('error');
        return;
      }
      // Anthropic: exit Ink, run `claude setup-token`, restart. Persist
      // activeProvider first so re-launch lands on anthropic — must await
      // so the write is flushed before we tear down Ink and re-exec.
      await saveSettings({ activeProvider: provider.id });
      if (onRequestOAuth) onRequestOAuth();
      return;
    }
    startInputForKey();
  }

  useInput((input, k) => {
    if (phase === 'pick') {
      if (k.upArrow || input === 'k') setCursor((c) => (c - 1 + PROVIDERS.length) % PROVIDERS.length);
      else if (k.downArrow || input === 'j') setCursor((c) => (c + 1) % PROVIDERS.length);
      else if (k.return) setPhase('method');
      else if (k.escape) onCancel();
      return;
    }
    if (phase === 'method') {
      if (k.upArrow || input === 'k') setMethodCursor((c) => (c - 1 + methodOptions.length) % methodOptions.length);
      else if (k.downArrow || input === 'j') setMethodCursor((c) => (c + 1) % methodOptions.length);
      else if (k.return) void chooseMethod();
      else if (k.escape) {
        if (initialProvider) onCancel();
        else setPhase('pick');
      }
      return;
    }
    if (phase === 'error' && (k.return || k.escape)) {
      // After error, drop into API-key flow. Helpful default for OAuth-not-supported.
      startInputForKey();
      setMessage('');
      return;
    }
    if ((phase === 'baseurl' || phase === 'key') && k.escape) {
      onCancel();
    }
  });

  async function submitBaseUrl(value: string): Promise<void> {
    const v = value.trim() || provider.baseURL;
    if (!v) {
      setMessage('base URL is required');
      setPhase('error');
      return;
    }
    setBaseURL(v);
    setPhase('key');
  }

  async function submitKey(value: string): Promise<void> {
    const trimmed = value.trim();
    const v = validateKey(provider, trimmed);
    if (!v.ok) {
      setMessage(v.reason);
      setPhase('error');
      return;
    }
    setPhase('saving');
    try {
      await saveProviderKey(provider.id as ProviderId, trimmed);
      const next: Parameters<typeof saveSettings>[0] = { activeProvider: provider.id };
      if (baseURL && baseURL !== provider.baseURL) {
        next.providers = { [provider.id]: { baseURL } };
      }
      await saveSettings(next);
      setPhase('done');
      doneTimerRef.current = setTimeout(() => {
        doneTimerRef.current = null;
        onDone(`logged in: ${provider.label}`);
      }, 400);
    } catch (err) {
      setMessage((err as Error).message);
      setPhase('error');
    }
  }

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1} borderStyle="round" borderColor={t.accent}>
      <Box paddingX={1}>
        <Text color={t.accent} bold>forge -- login</Text>
        <Text color={t.muted}>  · provider, then OAuth or API key</Text>
      </Box>

      {phase === 'pick' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={t.muted}>pick a provider (up/dn, enter, esc to cancel)</Text>
          <Box flexDirection="column" marginTop={1}>
            {PROVIDERS.map((p, i) => {
              const active = i === cursor;
              const native = p.nativeAnthropic ? '' : ' (proxy)';
              const oauthTag = OAUTH_NATIVE.has(p.id) ? ' · OAuth' : '';
              return (
                <Box key={p.id}>
                  <Text color={active ? t.accent : t.muted}>{active ? '> ' : '  '}</Text>
                  <Text color={active ? t.accent : t.text} bold={active}>
                    {p.label.padEnd(22)}
                  </Text>
                  <Text color={t.muted}>{p.id}{native}{oauthTag}</Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {phase === 'method' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={t.muted}>{provider.label} -- choose login method</Text>
          <Box flexDirection="column" marginTop={1}>
            {methodOptions.map((m, i) => {
              const active = i === methodCursor;
              const enabled = m.id === 'apikey' || oauthSupported;
              const color = active ? t.accent : enabled ? t.text : t.muted;
              return (
                <Box key={m.id}>
                  <Text color={active ? t.accent : t.muted}>{active ? '> ' : '  '}</Text>
                  <Text color={color} bold={active}>{m.label.padEnd(20)}</Text>
                  <Text color={t.muted}>{m.hint}</Text>
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text color={t.muted}>enter to pick · esc to go back</Text>
          </Box>
        </Box>
      )}

      {phase === 'baseurl' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={t.muted}>{provider.hint}</Text>
          {provider.notes && <Text color={t.muted}>note: {provider.notes}</Text>}
          <Box marginTop={1}>
            <Text color={t.accent}>base URL {provider.baseURL ? `[${provider.baseURL}] ` : ''}{'> '}</Text>
            <SimpleTextInput value={baseURL} onChange={setBaseURL} onSubmit={submitBaseUrl} placeholder={provider.baseURL || 'https://...'} />
          </Box>
          <Text color={t.muted}>enter to confirm, esc to cancel</Text>
        </Box>
      )}

      {phase === 'key' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={t.muted}>{provider.hint}</Text>
          <Box marginTop={1}>
            <Text color={t.accent}>{provider.label} key {'> '}</Text>
            <SimpleTextInput
              value={key}
              onChange={setKey}
              onSubmit={submitKey}
              mask="*"
              placeholder={provider.keyPrefixes?.[0] ? `${provider.keyPrefixes[0]}...` : 'paste key'}
            />
          </Box>
          <Text color={t.muted}>input is masked, esc to cancel</Text>
        </Box>
      )}

      {phase === 'saving' && (
        <Box paddingX={1} marginTop={1}><Text color={t.warn}>saving...</Text></Box>
      )}

      {phase === 'done' && (
        <Box paddingX={1} marginTop={1}><Text color={t.success}>logged in: {provider.label}</Text></Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={t.error}>!! {message}</Text>
          <Text color={t.muted}>enter or esc to continue with API key</Text>
        </Box>
      )}
    </Box>
  );
}
