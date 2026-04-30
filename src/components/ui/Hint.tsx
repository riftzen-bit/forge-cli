import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../../ui/theme.js';
import { G } from '../../ui/glyphs.js';

export type HintItem = {
  key: string;
  label: string;
  // Optional dim variant — used for "ghosted" hints whose action is
  // unavailable in the current state (e.g. esc cancel when idle).
  dim?: boolean;
};

type Props = {
  items: HintItem[];
  // When true, render a single inline row separated by middots.
  // When false (default), render two-column wrap-friendly format.
  inline?: boolean;
};

// Contextual hint row. Replaces the static SHORTCUTS list with a
// state-driven, condensed row of `<key>  <label>` pairs separated by a
// muted middot. Use a small `items` array (3–5) so the row never wraps
// on a 80-column terminal.
export function Hint({ items, inline = true }: Props) {
  const t = getTheme();
  if (items.length === 0) return null;

  if (!inline) {
    return (
      <Box flexDirection="column">
        {items.map((it, i) => (
          <Box key={i}>
            <Text color={it.dim ? t.muted : t.accentDim} bold>{it.key}</Text>
            <Text color={t.muted}>  {it.label}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box flexWrap="wrap">
      {items.map((it, i) => (
        <Box key={i}>
          {i > 0 && <Text color={t.borderIdle}>  {G.bullet}  </Text>}
          <Text color={it.dim ? t.muted : t.accentDim} bold>{it.key}</Text>
          <Text color={it.dim ? t.muted : t.muted}> {it.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
