import React from 'react';
import { Box, Text } from 'ink';
import { Clawd } from './Clawd.js';
import { getTheme } from '../ui/theme.js';

type Props = { cwd?: string };

export function Banner({ cwd }: Props) {
  const t = getTheme();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor={t.claude}
        paddingX={2}
        paddingY={0}
      >
        <Box marginRight={2}>
          <Clawd />
        </Box>
        <Box flexDirection="column" justifyContent="center">
          <Text color={t.claude} bold>Welcome to Forge</Text>
          <Text color={t.subtle}>an agentic coding assistant</Text>
          {cwd && (
            <Box marginTop={1}>
              <Text color={t.subtle}>cwd </Text>
              <Text>{shortenCwd(cwd)}</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function shortenCwd(cwd: string): string {
  return cwd.length > 60 ? '...' + cwd.slice(-59) : cwd;
}
