// In-session /login picker. Up to three phases:
//   1. provider — pick which provider to authenticate
//   2. method   — only when the provider supports OAuth: pick OAuth (browser)
//                 or API key. Skipped automatically when only API key is wired
//                 so the user never gets the old "OAuth not yet implemented"
//                 error and an API-key fallback prompt.
//   3. input    — paste API key (and base URL if non-native or 'custom')

import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { SimpleTextInput } from './SimpleTextInput.js';
import { PROVIDERS, validateKey, type ProviderId } from '../agent/providers.js';
import { saveProviderKey } from '../config/tokenStore.js';
import { loadSettings, saveSettings } from '../config/settings.js';
import { getTheme } from '../ui/theme.js';
import { G } from '../ui/glyphs.js';

type Phase = 'pick' | 'method' | 'ack' | 'baseurl' | 'key' | 'saving' | 'done' | 'error';
type Method = 'oauth' | 'apikey';
type AckChoice = 'continue' | 'cancel';

type Props = {
  initialProvider?: string;
  onDone: (msg: string) => void;
  onCancel: () => void;
  onRequestOAuth?: () => void;
};

export function LoginPicker({ initialProvider, onDone, onCancel, onRequestOAuth }: Props) {
  const t = getTheme();
  const [cursor, setCursor] = useState(() => {
    if (initialProvider) {
      const i = PROVIDERS.findIndex((p) => p.id === initialProvider);
      return i >= 0 ? i : 0;
    }
    return 0;
  });
  const provider = PROVIDERS[cursor]!;

  // Method phase only opens when the active provider has at least one OAuth
  // option to pair with API key. Otherwise we go straight to the input phase.
  const [phase, setPhase] = useState<Phase>(() => {
    if (!initialProvider) return 'pick';
    const p = PROVIDERS.find((x) => x.id === initialProvider);
    return p?.oauth ? 'method' : 'baseurl';
  });
  const [methodCursor, setMethodCursor] = useState(0);
  const [ackCursor, setAckCursor] = useState<AckChoice>('cancel');
  const [baseURL, setBaseURL] = useState('');
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
  }, []);

  const methodOptions: { id: Method; label: string; hint: string }[] = provider.oauth
    ? [
        { id: 'oauth',  label: 'OAuth (browser)', hint: 'opens claude setup-token in your browser' },
        { id: 'apikey', label: 'API key',         hint: 'paste a static key from the dashboard' },
      ]
    : [{ id: 'apikey', label: 'API key', hint: 'paste a static key from the dashboard' }];

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
      // Show responsibility ack before any OAuth handoff. The user is
      // signing into their own paid account; consequences (cost, ban,
      // ToS) are theirs. Ack defaults to 'cancel' so an accidental
      // Enter doesn't blow past the warning.
      setAckCursor('cancel');
      setPhase('ack');
      return;
    }
    startInputForKey();
  }

  async function ackContinue(): Promise<void> {
    // Anthropic: exit Ink, run `claude setup-token`, restart. Persist
    // activeProvider first so re-launch lands on anthropic — must await
    // so the write is flushed before we tear down Ink and re-exec.
    await saveSettings({ activeProvider: provider.id });
    if (onRequestOAuth) onRequestOAuth();
  }

  // From the provider list, decide whether to show the method phase or
  // skip directly to API-key input. Eliminates the dead-end "OAuth not
  // implemented" message users used to hit on Gemini / OpenAI / etc.
  function advanceFromPick(): void {
    const p = PROVIDERS[cursor]!;
    if (p.oauth) {
      setPhase('method');
    } else if (p.id === 'custom' || !p.nativeAnthropic) {
      setBaseURL(p.baseURL);
      setPhase('baseurl');
    } else {
      setPhase('key');
    }
  }

  useInput((input, k) => {
    if (phase === 'pick') {
      if (k.upArrow || input === 'k') setCursor((c) => (c - 1 + PROVIDERS.length) % PROVIDERS.length);
      else if (k.downArrow || input === 'j') setCursor((c) => (c + 1) % PROVIDERS.length);
      else if (k.return) advanceFromPick();
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
    if (phase === 'ack') {
      if (k.upArrow || k.downArrow || k.tab || input === 'j' || input === 'k') {
        setAckCursor((c) => (c === 'cancel' ? 'continue' : 'cancel'));
        return;
      }
      if (input === 'y' || input === 'Y') {
        setAckCursor('continue');
        void ackContinue();
        return;
      }
      if (input === 'n' || input === 'N') {
        setAckCursor('cancel');
        setPhase('method');
        return;
      }
      if (k.return) {
        if (ackCursor === 'continue') void ackContinue();
        else setPhase('method');
        return;
      }
      if (k.escape) setPhase('method');
      return;
    }
    if (phase === 'error' && (k.return || k.escape)) {
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
        // Merge against existing providers so we don't wipe configs for
        // every other provider the user has previously set up. saveSettings
        // does a shallow top-level merge, so we must hand it a complete
        // providers map.
        const cur = await loadSettings();
        next.providers = {
          ...cur.providers,
          [provider.id]: { ...cur.providers?.[provider.id], baseURL },
        };
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

  function authChip(p: { oauth: boolean }): React.ReactElement {
    return p.oauth ? (
      <Text color={t.success} backgroundColor={t.selection} bold> OAuth </Text>
    ) : (
      <Text color={t.info} backgroundColor={t.selection} bold> Key </Text>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1} borderStyle="round" borderColor={t.accent}>
      <Box paddingX={1}>
        <Text color={t.accent} bold>{G.star} forge </Text>
        <Text color={t.muted}>{G.bullet} </Text>
        <Text color={t.accentDim}>sign in</Text>
      </Box>

      {phase === 'pick' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={t.muted}>pick a provider — up/dn, enter to choose, esc to cancel</Text>
          <Box flexDirection="column" marginTop={1}>
            {PROVIDERS.map((p, i) => {
              const active = i === cursor;
              const native = p.nativeAnthropic ? '' : 'proxy';
              return (
                <Box key={p.id}>
                  <Text color={active ? t.accent : t.muted} bold>{active ? `${G.prompt} ` : '  '}</Text>
                  <Text color={active ? t.accent : t.text} bold={active}>{p.label.padEnd(22)}</Text>
                  {authChip(p)}
                  <Text color={t.muted}>  {p.id}</Text>
                  {native && <Text color={t.muted}>  {G.bullet}  {native}</Text>}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {phase === 'method' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Box>
            <Text color={t.accent} bold>{provider.label}</Text>
            <Text color={t.muted}>  {G.bullet}  choose login method</Text>
          </Box>
          <Box flexDirection="column" marginTop={1}>
            {methodOptions.map((m, i) => {
              const active = i === methodCursor;
              return (
                <Box key={m.id}>
                  <Text color={active ? t.accent : t.muted} bold>{active ? `${G.prompt} ` : '  '}</Text>
                  <Text color={active ? t.accent : t.text} bold={active}>{m.label.padEnd(20)}</Text>
                  <Text color={t.muted}>{m.hint}</Text>
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text color={t.muted}>enter to pick {G.bullet} esc to go back</Text>
          </Box>
        </Box>
      )}

      {phase === 'ack' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Box>
            <Text color={t.warn} bold>responsibility notice</Text>
          </Box>
          <Box flexDirection="column" marginTop={1}>
            <Text color={t.text}>You are about to sign into <Text color={t.accent} bold>{provider.label}</Text> with your own account.</Text>
            <Text color={t.muted}>You — not Forge — are responsible for:</Text>
            <Text color={t.muted}>  {G.bullet} cost or quota incurred against this account</Text>
            <Text color={t.muted}>  {G.bullet} suspension, rate-limiting, or ban from the provider</Text>
            <Text color={t.muted}>  {G.bullet} compliance with the provider's Terms of Service</Text>
          </Box>
          <Box flexDirection="column" marginTop={1}>
            {(['continue', 'cancel'] as AckChoice[]).map((c) => {
              const active = ackCursor === c;
              const color = c === 'continue' ? t.success : t.muted;
              const label = c === 'continue' ? 'Continue (y)' : 'Cancel (n)';
              return (
                <Box key={c}>
                  <Text color={active ? color : t.muted} bold>{active ? `${G.prompt} ` : '  '}</Text>
                  <Text color={active ? color : t.text} bold={active}>{label}</Text>
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text color={t.muted}>up/dn or tab to switch {G.bullet} y/n to pick {G.bullet} esc to go back</Text>
          </Box>
        </Box>
      )}

      {phase === 'baseurl' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={t.muted}>{provider.hint}</Text>
          {provider.notes && <Text color={t.muted}>note: {provider.notes}</Text>}
          <Box marginTop={1}>
            <Text color={t.accent}>base URL {provider.baseURL ? `[${provider.baseURL}]` : ''} {G.prompt} </Text>
            <SimpleTextInput value={baseURL} onChange={setBaseURL} onSubmit={submitBaseUrl} placeholder={provider.baseURL || 'https://...'} />
          </Box>
          <Text color={t.muted}>enter to confirm {G.bullet} esc to cancel</Text>
        </Box>
      )}

      {phase === 'key' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={t.muted}>{provider.hint}</Text>
          <Box marginTop={1}>
            <Text color={t.accent}>{provider.label} key {G.prompt} </Text>
            <SimpleTextInput
              value={key}
              onChange={setKey}
              onSubmit={submitKey}
              mask="*"
              placeholder={provider.keyPrefixes?.[0] ? `${provider.keyPrefixes[0]}...` : 'paste key'}
            />
          </Box>
          <Text color={t.muted}>input is masked {G.bullet} esc to cancel</Text>
        </Box>
      )}

      {phase === 'saving' && (
        <Box paddingX={1} marginTop={1}><Text color={t.warn}>{G.ellipsis} saving</Text></Box>
      )}

      {phase === 'done' && (
        <Box paddingX={1} marginTop={1}>
          <Text color={t.success} bold>{G.toolOk} </Text>
          <Text color={t.success}>logged in: {provider.label}</Text>
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Box>
            <Text color={t.error} bold>{G.toolErr} </Text>
            <Text color={t.error}>{message}</Text>
          </Box>
          <Text color={t.muted}>enter or esc to continue with API key</Text>
        </Box>
      )}
    </Box>
  );
}
