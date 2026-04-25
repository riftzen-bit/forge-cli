import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { SimpleTextInput } from './SimpleTextInput.js';
import { saveToken, primaryTokenPath } from '../config/tokenStore.js';
import { getTheme } from '../ui/theme.js';
import { G } from '../ui/glyphs.js';

type Phase = 'pick' | 'input' | 'saving' | 'done' | 'error';
type OptionId = 'paste' | 'oauth' | 'quit';

type Props = {
  onLoggedIn: () => void;
  onRequestOAuth: () => void;
};

const TOKEN_PREFIX = 'sk-ant-';

const OPTIONS: { id: OptionId; label: string; hint: string }[] = [
  { id: 'paste', label: 'paste an API token', hint: 'from console.anthropic.com/settings/keys' },
  { id: 'oauth', label: 'run `claude setup-token` (browser OAuth)', hint: 'uses your existing subscription' },
  { id: 'quit',  label: 'quit',                                     hint: 'esc or q any time' },
];

export function LoginScreen({ onLoggedIn, onRequestOAuth }: Props) {
  const t = getTheme();
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('pick');
  const [cursor, setCursor] = useState(0);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const loggedInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (loggedInTimerRef.current) clearTimeout(loggedInTimerRef.current);
  }, []);

  useInput((input, key) => {
    if (phase === 'pick') {
      if (key.upArrow || input === 'k') setCursor((c) => (c - 1 + OPTIONS.length) % OPTIONS.length);
      else if (key.downArrow || input === 'j') setCursor((c) => (c + 1) % OPTIONS.length);
      else if (key.return) choose(OPTIONS[cursor].id);
      else if (input === 'q' || key.escape) exit();
      return;
    }
    if (phase === 'error' && (key.return || key.escape)) {
      setPhase('pick');
      setMessage('');
      setToken('');
      return;
    }
    if (phase === 'input' && key.escape) {
      setPhase('pick');
      setToken('');
    }
  });

  function choose(id: OptionId) {
    if (id === 'quit') return exit();
    if (id === 'oauth') return onRequestOAuth();
    setPhase('input');
  }

  async function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setMessage('token cannot be empty');
      setPhase('error');
      return;
    }
    if (!trimmed.startsWith(TOKEN_PREFIX)) {
      setMessage(`token must start with "${TOKEN_PREFIX}"`);
      setPhase('error');
      return;
    }

    setPhase('saving');
    try {
      const path = await saveToken(trimmed);
      setSavedPath(path);
      setToken('');
      setPhase('done');
      loggedInTimerRef.current = setTimeout(() => {
        loggedInTimerRef.current = null;
        onLoggedIn();
      }, 500);
    } catch (err) {
      setMessage((err as Error).message);
      setPhase('error');
    }
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} borderStyle="round" borderColor={t.accent}>
      <Box paddingX={1}>
        <Text color={t.accent} bold>{G.star} forge </Text>
        <Text color={t.muted}>{G.bullet} </Text>
        <Text color={t.accentDim}>sign in</Text>
      </Box>

      {phase === 'pick' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={t.muted}>no token configured — pick a method</Text>
          <Box flexDirection="column" marginTop={1}>
            {OPTIONS.map((opt, i) => {
              const active = i === cursor;
              return (
                <Box key={opt.id}>
                  <Text color={active ? t.accent : t.muted} bold>
                    {active ? `${G.prompt} ` : '  '}
                  </Text>
                  <Text color={active ? t.accent : t.text} bold={active}>
                    {opt.label.padEnd(38)}
                  </Text>
                  <Text color={t.muted}>{opt.hint}</Text>
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text color={t.muted}>up/dn move {G.bullet} enter select {G.bullet} q quit</Text>
          </Box>
        </Box>
      )}

      {phase === 'input' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={t.muted}>
            paste token starting with {TOKEN_PREFIX}, then press enter
          </Text>
          <Text color={t.muted}>
            target: {primaryTokenPath()} (hidden, chmod 600)
          </Text>
          <Box marginTop={1}>
            <Text color={t.accent}>{G.prompt} </Text>
            <SimpleTextInput
              value={token}
              onChange={setToken}
              onSubmit={submit}
              mask="*"
              placeholder={`${TOKEN_PREFIX}...`}
            />
          </Box>
          <Text color={t.muted}>input is masked {G.bullet} esc to cancel</Text>
        </Box>
      )}

      {phase === 'saving' && (
        <Box paddingX={1} marginTop={1}>
          <Text color={t.warn}>{G.ellipsis} saving token</Text>
        </Box>
      )}

      {phase === 'done' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Box>
            <Text color={t.success} bold>{G.toolOk} </Text>
            <Text color={t.success}>token saved</Text>
          </Box>
          <Text color={t.muted}>{savedPath}</Text>
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Box>
            <Text color={t.error} bold>{G.toolErr} </Text>
            <Text color={t.error}>{message}</Text>
          </Box>
          <Text color={t.muted}>enter or esc to go back</Text>
        </Box>
      )}
    </Box>
  );
}
