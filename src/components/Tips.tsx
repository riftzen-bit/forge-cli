import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';

export function Tips() {
  const t = getTheme();
  return (
    <Box flexDirection="column" paddingX={2} marginBottom={1}>
      <Text color={t.subtle}>Try asking:</Text>
      <Text color={t.subtle}>  build a React todo app with Vite + tests</Text>
      <Text color={t.subtle}>  read src/server.ts and add request-id middleware</Text>
      <Text color={t.subtle}>  run the tests and fix the first failure</Text>
    </Box>
  );
}
