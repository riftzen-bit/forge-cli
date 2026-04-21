import React from 'react';
import { Box, Text } from 'ink';
import type { SlashCommand } from '../commands/registry.js';

type Props = {
  commands: SlashCommand[];
  cursor: number;
};

export function CommandPalette({ commands, cursor }: Props) {
  if (commands.length === 0) return null;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
      <Box marginBottom={1}>
        <Text dimColor>slash commands · ↑/↓ move · tab complete · esc clear</Text>
      </Box>
      {commands.map((c, i) => {
        const active = i === cursor;
        return (
          <Box key={c.name}>
            <Text color={active ? 'cyan' : undefined} bold={active}>
              {active ? '❯ ' : '  '}/{c.name}
            </Text>
            <Text dimColor>{'  '}{c.usage ?? c.hint}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
