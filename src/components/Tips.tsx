import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';

const EXAMPLES = [
  'read src/server.ts and add a request-id middleware',
  'run the tests and fix the first failure',
  'build a react+vite todo app with tests',
];

const SHORTCUTS: { keys: string; hint: string }[] = [
  { keys: 'ctrl+v',    hint: 'paste image from clipboard' },
  { keys: '@<path>',   hint: 'attach a file by mention' },
  { keys: '!<cmd>',    hint: 'run a shell command' },
  { keys: 'shift+tab', hint: 'cycle permission mode' },
];

export function Tips() {
  const t = getTheme();
  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="round"
      borderColor={t.borderIdle}
      paddingX={2}
      paddingY={0}
    >
      <Text color={t.warn} bold>examples</Text>
      {EXAMPLES.map((ex, i) => (
        <Box key={`ex-${i}`}>
          <Text color={t.accent}>{'> '}</Text>
          <Text color={t.text}>{ex}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={t.info} bold>shortcuts</Text>
      </Box>
      {SHORTCUTS.map((s, i) => (
        <Box key={`sc-${i}`}>
          <Text color={t.accent} bold>{s.keys.padEnd(12)}</Text>
          <Text color={t.muted}>{s.hint}</Text>
        </Box>
      ))}
    </Box>
  );
}
