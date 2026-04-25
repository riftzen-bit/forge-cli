import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';
import { G } from '../ui/glyphs.js';

type Props = { cwd?: string; version?: string };

// Bordered identity card. Two-line inner layout: the brand row carries
// the star + wordmark + tagline, the meta row carries version + cwd.
// Card has its own visual weight so the agent's identity doesn't read
// as "just another line of help text".
export function Banner({ cwd, version = '0.1' }: Props) {
  const t = getTheme();
  const path = shortenCwd(cwd ?? '');
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        borderStyle="round"
        borderColor={t.accent}
        paddingX={2}
        paddingY={0}
        flexDirection="column"
      >
        <Box>
          <Text color={t.accent} bold>{G.star}  </Text>
          <Text color={t.accent} bold>FORGE</Text>
          <Text color={t.muted}>     </Text>
          <Text color={t.accentDim}>terminal coding agent</Text>
        </Box>
        <Box>
          <Text color={t.muted}>{'   '}v{version}</Text>
          <Text color={t.borderIdle}>   {G.bullet}   </Text>
          <Text color={t.muted}>{path}</Text>
        </Box>
      </Box>
    </Box>
  );
}

function shortenCwd(cwd: string): string {
  if (!cwd) return '';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  let s = cwd;
  if (home && s.toLowerCase().startsWith(home.toLowerCase())) {
    s = '~' + s.slice(home.length);
  }
  s = s.replace(/\\/g, '/');
  return s.length > 60 ? '...' + s.slice(-59) : s;
}
