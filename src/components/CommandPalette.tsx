import React from 'react';
import { Box, Text } from 'ink';
import type { SlashCommand } from '../commands/registry.js';
import { getTheme } from '../ui/theme.js';

type Props = {
  commands: SlashCommand[];
  cursor: number;
};

export function CommandPalette({ commands, cursor }: Props) {
  if (commands.length === 0) return null;
  const t = getTheme();
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={t.borderIdle}
      paddingX={1}
    >
      <Text color={t.warn} bold>commands</Text>
      <Text color={t.muted}>up/dn move, tab complete, esc clear</Text>
      {commands.map((c, i) => {
        const active = i === cursor;
        return (
          <Box key={c.name}>
            <Text color={active ? t.accent : t.muted}>
              {active ? '> ' : '  '}
            </Text>
            <Text color={active ? t.accent : t.text} bold={active}>
              /{c.name}
            </Text>
            <Text color={t.muted}>  {c.usage ?? c.hint}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
