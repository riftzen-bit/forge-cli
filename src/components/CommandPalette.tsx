import React, { memo } from 'react';
import { Box, Text } from 'ink';
import type { SlashCommand } from '../commands/registry.js';
import { getTheme } from '../ui/theme.js';

type Props = {
  commands: SlashCommand[];
  cursor: number;
};

const MAX_VISIBLE = 8;

function CommandPaletteImpl({ commands, cursor }: Props) {
  if (commands.length === 0) return null;
  const t = getTheme();
  const start = Math.max(0, Math.min(commands.length - MAX_VISIBLE, cursor - Math.floor(MAX_VISIBLE / 2)));
  const visible = commands.slice(start, start + MAX_VISIBLE);
  const hiddenBelow = commands.length - (start + visible.length);
  const hiddenAbove = start;

  return (
    <Box flexDirection="column" paddingX={1}>
      {hiddenAbove > 0 && (
        <Text color={t.muted}>  +{hiddenAbove} above</Text>
      )}
      {visible.map((c, i) => {
        const idx = start + i;
        const active = idx === cursor;
        return (
          <Box key={c.name}>
            <Text color={active ? t.accent : t.muted}>
              {active ? '›' : ' '}
            </Text>
            <Text color={active ? t.accent : t.toolTag} bold={active}> /{c.name.padEnd(9)}</Text>
            <Text color={t.muted}>{c.usage ?? c.hint}</Text>
          </Box>
        );
      })}
      {hiddenBelow > 0 && (
        <Text color={t.muted}>  +{hiddenBelow} below</Text>
      )}
    </Box>
  );
}

export const CommandPalette = memo(CommandPaletteImpl, (prev, next) => {
  if (prev.cursor !== next.cursor) return false;
  if (prev.commands.length !== next.commands.length) return false;
  for (let i = 0; i < prev.commands.length; i++) {
    if (prev.commands[i]!.name !== next.commands[i]!.name) return false;
  }
  return true;
});
