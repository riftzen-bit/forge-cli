import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { SimpleTextInput } from './SimpleTextInput.js';
import { saveToken, primaryTokenPath } from '../config/tokenStore.js';
import { getTheme } from '../ui/theme.js';

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
      setTimeout(onLoggedIn, 500);
    } catch (err) {
      setMessage((err as Error).message);
      setPhase('error');
    }
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={t.accent} bold>forge -- sign in</Text>

      {phase === 'pick' && (
        <>
          <Text color={t.muted}>no token configured. pick a method:</Text>
          <Box flexDirection="column" marginTop={1}>
            {OPTIONS.map((opt, i) => {
              const active = i === cursor;
              return (
                <Box key={opt.id}>
                  <Text color={active ? t.accent : t.muted}>
                    {active ? '> ' : '  '}
                  </Text>
                  <Text color={active ? t.accent : t.text} bold={active}>
                    {opt.label}
                  </Text>
                  <Text color={t.muted}>  {opt.hint}</Text>
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text color={t.muted}>up/dn or j/k move, enter select, q quit</Text>
          </Box>
        </>
      )}

      {phase === 'input' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={t.muted}>
            paste token starting with {TOKEN_PREFIX}, then press enter
          </Text>
          <Text color={t.muted}>
            target: {primaryTokenPath()} (hidden, chmod 600)
          </Text>
          <Box marginTop={1}>
            <Text color={t.accent}>{'> '}</Text>
            <SimpleTextInput
              value={token}
              onChange={setToken}
              onSubmit={submit}
              mask="*"
              placeholder={`${TOKEN_PREFIX}...`}
            />
          </Box>
          <Text color={t.muted}>input is masked, esc to cancel</Text>
        </Box>
      )}

      {phase === 'saving' && <Text color={t.warn}>.. saving token</Text>}

      {phase === 'done' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={t.success}>ok token saved</Text>
          <Text color={t.muted}>{savedPath}</Text>
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={t.error}>!! {message}</Text>
          <Text color={t.muted}>press enter/esc to go back</Text>
        </Box>
      )}
    </Box>
  );
}
