import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';

// Big ASCII brand for the empty-state landing screen. Six lines tall.
// Glyphs are drawn from a contiguous block-letter set so the kerning works
// out without manual padding. Lower-row letters share a baseline.
//
// Auto-clears the moment the user sends their first message — Conversation
// drops the empty-state items from the Static when history.length > 0.
const ASCII_FORGE = [
  '  ███████╗ ██████╗ ██████╗  ██████╗ ███████╗',
  '  ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝',
  '  █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ',
  '  ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ',
  '  ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗',
  '  ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
];

type Props = {
  cwd?: string;
  version?: string;
  modelLabel?: string;
};

// shortenCwd duplicated from Banner to keep Brand self-contained — when we
// finally retire Banner we'll inline this helper in one place.
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

export function Brand({ cwd, version = '0.1', modelLabel }: Props) {
  const t = getTheme();
  const path = shortenCwd(cwd ?? '');
  return (
    <Box flexDirection="column" marginBottom={1}>
      {ASCII_FORGE.map((line, i) => (
        <Text key={i} color={t.accent} bold>
          {line}
        </Text>
      ))}
      <Box marginTop={1} paddingLeft={2}>
        <Text color={t.muted}>v{version}</Text>
        {modelLabel && (
          <>
            <Text color={t.borderIdle}>   </Text>
            <Text color={t.text}>{modelLabel}</Text>
          </>
        )}
        {path && (
          <>
            <Text color={t.borderIdle}>   </Text>
            <Text color={t.muted}>{path}</Text>
          </>
        )}
      </Box>
      <Box paddingLeft={2}>
        <Text color={t.muted}># type a message below to begin a session</Text>
      </Box>
    </Box>
  );
}
