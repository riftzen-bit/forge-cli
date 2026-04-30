import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../../ui/theme.js';

// Turn-rail marker. Replaces the prior IPython-style "In [N]:" / "Out [N]:"
// cell numbering — counters added visual noise without information value
// (the conversation is linear; users never reference a turn by number).
//
// Now: one glyph + role label per turn. Role color carries the meaning,
// content sits at a small indent below.
type Kind = 'user' | 'assistant' | 'step';

type Props = {
  kind: Kind;
  meta?: string;
};

function styleFor(kind: Kind, t: ReturnType<typeof getTheme>) {
  switch (kind) {
    case 'user':      return { glyph: '\u203a', label: 'you',   color: t.info };
    case 'assistant': return { glyph: '\u2726', label: 'forge', color: t.accent };
    case 'step':
    default:          return { glyph: '\u00b7', label: 'step',  color: t.muted };
  }
}

export function CellMarker({ kind, meta }: Props) {
  const t = getTheme();
  const s = styleFor(kind, t);
  return (
    <Box>
      <Text color={s.color} bold>{s.glyph} </Text>
      <Text color={s.color} bold>{s.label}</Text>
      {meta && (
        <>
          <Text color={t.muted}>  </Text>
          <Text color={t.muted}>{meta}</Text>
        </>
      )}
    </Box>
  );
}
