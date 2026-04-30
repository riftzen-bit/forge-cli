import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';

// Notebook-style empty-state hint. Rendered as Python comment lines so it
// blends with the IPython look without competing with the Brand block above.
const TIPS = [
  '# /        commands palette',
  '# @path   attach a file',
  '# !cmd    run shell command',
  '# ctrl+v  paste clipboard image',
  '# shift+\u21e5  cycle permission mode',
];

export function Tips() {
  const t = getTheme();
  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
      {TIPS.map((line, i) => (
        <Text key={i} color={t.muted}>{line}</Text>
      ))}
    </Box>
  );
}
