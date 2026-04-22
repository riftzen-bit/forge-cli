import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { saveToken, primaryTokenPath } from '../config/tokenStore.js';

type Phase = 'pick' | 'input' | 'saving' | 'done' | 'error';
type OptionId = 'paste' | 'oauth' | 'quit';

type Props = {
  onLoggedIn: () => void;
  onRequestOAuth: () => void;
};

const TOKEN_PREFIX = 'sk-ant-';

const OPTIONS: { id: OptionId; label: string; hint: string }[] = [
  { id: 'paste', label: 'Paste an API token', hint: 'from console.anthropic.com/settings/keys' },
  { id: 'oauth', label: 'Run `claude setup-token` (browser OAuth)', hint: 'uses your Claude Code subscription' },
  { id: 'quit', label: 'Quit', hint: 'esc or q any time' },
];

export function LoginScreen({ onLoggedIn, onRequestOAuth }: Props) {
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
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Welcome to forge</Text>
        <Text dimColor>   (alias: </Text>
        <Text italic color="magenta">map</Text>
        <Text dimColor>)</Text>
      </Box>

      {phase === 'pick' && (
        <>
          <Text dimColor>you are not signed in. choose a method:</Text>
          <Box flexDirection="column" marginTop={1}>
            {OPTIONS.map((opt, i) => {
              const active = i === cursor;
              return (
                <Box key={opt.id}>
                  <Text color={active ? 'cyan' : undefined} bold={active}>
                    {active ? '> ' : '  '}{opt.label}
                  </Text>
                  <Text dimColor>  {opt.hint}</Text>
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>up/dn or j/k to move · enter to select · q to quit</Text>
          </Box>
        </>
      )}

      {phase === 'input' && (
        <>
          <Text dimColor>paste the token that starts with </Text>
          <Text bold>{TOKEN_PREFIX}</Text>
          <Text dimColor>, then press Enter</Text>
          <Text dimColor>target: <Text italic>{primaryTokenPath()}</Text> (hidden, chmod 600)</Text>
          <Box marginTop={1}>
            <Text color="green" bold>{'> '}</Text>
            <TextInput
              value={token}
              onChange={setToken}
              onSubmit={submit}
              mask="•"
              placeholder={`${TOKEN_PREFIX}...`}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>input is masked · esc to cancel</Text>
          </Box>
        </>
      )}

      {phase === 'saving' && <Text color="yellow">● saving token...</Text>}

      {phase === 'done' && (
        <Box flexDirection="column">
          <Box>
            <Text color="green">v </Text>
            <Text>token saved</Text>
          </Box>
          <Text dimColor>{savedPath}</Text>
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column">
          <Box>
            <Text color="red">x </Text>
            <Text>{message}</Text>
          </Box>
          <Text dimColor>press enter/esc to go back</Text>
        </Box>
      )}
    </Box>
  );
}
