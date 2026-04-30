import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';
import { G } from '../ui/glyphs.js';

type Props = {
  cwd?: string;
  version?: string;
  modelLabel?: string;
  modeLabel?: string;
  modeColor?: string;
};

// Banner is intentionally sparse: brand + cwd only. Model and permission
// mode live in the bottom status bar where they update on every tool call —
// duplicating them here would put the same info in two places.
// Props for model/mode/version are kept for backward-compat callers but
// ignored.
export function Banner({ cwd }: Props) {
  const t = getTheme();
  const path = shortenCwd(cwd ?? '');
  return (
    <Box marginBottom={1}>
      <Text color={t.accent} bold>{G.star} forge</Text>
      {path && (
        <>
          <Text color={t.borderIdle}>  </Text>
          <Text color={t.muted}>{path}</Text>
        </>
      )}
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
