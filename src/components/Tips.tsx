import React from 'react';
import { Box, Text } from 'ink';

export function Tips() {
  return (
    <Box flexDirection="column" paddingX={2} marginBottom={1}>
      <Text dimColor>Try asking:</Text>
      <Text color="gray">  build a React todo app with Vite + tests</Text>
      <Text color="gray">  read src/server.ts and add request-id middleware</Text>
      <Text color="gray">  run the tests and fix the first failure</Text>
    </Box>
  );
}
