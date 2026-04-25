import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';
import { G } from '../ui/glyphs.js';

type Props = { cwd?: string; version?: string };

// Slim editorial header. Replaces the six-line block-ASCII logo with a
// single accent line + a thin separator rule. Saves vertical space on
// small terminals (Tips already eats five lines below) and reads as
// "designed" rather than "phpBB 2003".
export function Banner({ cwd, version = '0.1' }: Props) {
  const t = getTheme();
  const path = shortenCwd(cwd ?? '');
  const rule = ruleLine();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={t.accent} bold>{G.star} </Text>
        <Text color={t.accent} bold>forge</Text>
        <Text color={t.muted}>  {G.bullet}  </Text>
        <Text color={t.accentDim}>terminal coding agent</Text>
        <Text color={t.muted}>  {G.bullet}  </Text>
        <Text color={t.muted}>v{version}</Text>
      </Box>
      <Text color={t.borderIdle}>{rule}</Text>
      <Box>
        <Text color={t.muted}>{path}</Text>
      </Box>
    </Box>
  );
}

function ruleLine(): string {
  const w = Math.min(72, (process.stdout.columns ?? 80) - 2);
  return G.hr.repeat(Math.max(20, w));
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
