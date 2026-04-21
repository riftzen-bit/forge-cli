import React from 'react';
import { Box, Text } from 'ink';

export function Banner() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={3}
        paddingY={1}
      >
        <Box>
          <Text color="magenta" bold>✦ </Text>
          <Text color="cyan" bold>F O R G E</Text>
          <Text dimColor>   forge code in your terminal · think · build</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>commands  </Text>
          <Text color="cyan">/help</Text>
          <Text dimColor>  </Text>
          <Text color="cyan">/exit</Text>
        </Box>
        <Box>
          <Text dimColor>tip       type a request, or </Text>
          <Text color="cyan">/</Text>
          <Text dimColor> to open the command palette</Text>
        </Box>
      </Box>
    </Box>
  );
}
