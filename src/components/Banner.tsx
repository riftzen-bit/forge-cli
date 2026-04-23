import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';

const LOGO = [
  '  ███████╗ ██████╗ ██████╗  ██████╗ ███████╗',
  '  ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝',
  '  █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ',
  '  ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ',
  '  ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗',
  '  ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
];

type Props = { cwd?: string; version?: string };

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
        {LOGO.map((line, i) => (
          <Text key={i} color={t.accent} bold>{line}</Text>
        ))}
        <Box marginTop={1}>
          <Text color={t.accentDim}>  terminal coding agent</Text>
          <Text color={t.muted}>   v{version}</Text>
          <Text color={t.muted}>   {path}</Text>
        </Box>
      </Box>
      <Box marginTop={1} paddingX={1}>
        <Text color={t.muted}>type </Text>
        <Text color={t.accent} bold>/</Text>
        <Text color={t.muted}> for commands  </Text>
        <Text color={t.muted}>|  </Text>
        <Text color={t.accent} bold>ctrl+o</Text>
        <Text color={t.muted}> details  </Text>
        <Text color={t.muted}>|  </Text>
        <Text color={t.accent} bold>ctrl+c</Text>
        <Text color={t.muted}> quit</Text>
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
