import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';
import { G } from '../ui/glyphs.js';

const EXAMPLES = [
  'add request-id middleware to src/server.ts',
  'run the tests and fix the first failure',
  'scaffold a react+vite todo app with tests',
];

const SHORTCUTS: Array<[string, string]> = [
  ['/',          'cmds'],
  ['@<path>',    'attach'],
  ['!<cmd>',     'shell'],
  ['ctrl+v',     'paste'],
  ['ctrl+o',     'verbose'],
  ['shift+tab',  'mode'],
];

// Examples + shortcuts panel. Two distinct surfaces:
//   1. soft-bordered example card with a small label header
//   2. a single chip strip for keyboard shortcuts
// No fake tree connectors; spacing alone carries the hierarchy.
export function Tips() {
  const t = getTheme();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        borderStyle="round"
        borderColor={t.borderIdle}
        paddingX={2}
        paddingY={0}
        flexDirection="column"
      >
        <Box>
          <Text color={t.warn} bold>{G.star} examples</Text>
        </Box>
        {EXAMPLES.map((ex, i) => (
          <Box key={i}>
            <Text color={t.accentDim}>  {G.bullet}  </Text>
            <Text color={t.text}>{ex}</Text>
          </Box>
        ))}
      </Box>
      <Box paddingX={1} marginTop={1} flexWrap="wrap">
        {SHORTCUTS.map(([k, v], i) => (
          <Box key={i}>
            <Text color={t.accent} backgroundColor={t.selection} bold> {k} </Text>
            <Text color={t.muted}> {v}</Text>
            {i < SHORTCUTS.length - 1 && <Text color={t.borderIdle}>   </Text>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
