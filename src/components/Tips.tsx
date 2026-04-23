import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';

const EXAMPLES = [
  'read src/server.ts and add a request-id middleware',
  'run the tests and fix the first failure',
  'build a react+vite todo app with tests',
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
        <Box key={i}>
          <Text color={t.accent}>{'> '}</Text>
          <Text color={t.text}>{ex}</Text>
        </Box>
      ))}
    </Box>
  );
}
