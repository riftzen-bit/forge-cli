import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';
import { G } from '../ui/glyphs.js';

// Compact two-column tips card. Half the vertical footprint of the old
// double-section (examples + shortcuts) panel — keeps the prompt closer
// to the top of the viewport on first launch.

const EXAMPLES = [
  'add request-id middleware to src/server.ts',
  'run the tests and fix the first failure',
  'scaffold a react+vite todo app with tests',
];

const SHORTCUTS: Array<[string, string]> = [
  ['/',          'commands'],
  ['@<path>',    'attach file'],
  ['!<cmd>',     'shell'],
  ['ctrl+v',     'paste image'],
  ['ctrl+o',     'verbose'],
  ['shift+tab',  'mode'],
];

export function Tips() {
  const t = getTheme();
  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      <Box>
        <Text color={t.warn} bold>{G.star} try </Text>
        <Text color={t.muted}>{G.bullet} </Text>
        <Text color={t.text}>{EXAMPLES[0]}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color={t.muted}>{G.branch}{G.hr} </Text>
        <Text color={t.text} dimColor>{EXAMPLES[1]}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color={t.muted}>{G.branchEnd}{G.hr} </Text>
        <Text color={t.text} dimColor>{EXAMPLES[2]}</Text>
      </Box>
      <Box marginTop={1} flexWrap="wrap">
        {SHORTCUTS.map(([k, v], i) => (
          <Box key={i}>
            <Text color={t.accent} bold>{k}</Text>
            <Text color={t.muted}> {v}</Text>
            {i < SHORTCUTS.length - 1 && <Text color={t.borderIdle}>  {G.bullet}  </Text>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
