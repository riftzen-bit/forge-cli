import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../../ui/theme.js';
import { G } from '../../ui/glyphs.js';

type Role = 'user' | 'assistant' | 'thinking' | 'shell' | 'system' | 'error';

type Props = {
  role: Role;
  meta?: string;
  glyphOverride?: string;
  labelOverride?: string;
};

// One-line header for message rows. Replaces the previous 2-line
// "glyph + role" header to compress the conversation rail.
//   ❯  you   <meta>
//   ✦  forge <meta>
export function RoleHeader({ role, meta, glyphOverride, labelOverride }: Props) {
  const t = getTheme();
  const conf = paletteFor(role, t);
  const glyph = glyphOverride ?? conf.glyph;
  const label = labelOverride ?? conf.label;
  return (
    <Box>
      <Text color={conf.color} bold>{glyph} </Text>
      <Text color={conf.color} bold>{label}</Text>
      {meta && (
        <>
          <Text color={t.muted}>   </Text>
          <Text color={t.muted}>{meta}</Text>
        </>
      )}
    </Box>
  );
}

function paletteFor(role: Role, t: ReturnType<typeof getTheme>) {
  switch (role) {
    case 'user':       return { glyph: G.prefixYou,   label: 'you',     color: t.info };
    case 'assistant':  return { glyph: G.prefixForge, label: 'forge',   color: t.accent };
    case 'thinking':   return { glyph: G.diamondHollow, label: 'thought', color: t.muted };
    case 'shell':      return { glyph: '$',           label: 'shell',   color: t.warn };
    case 'error':      return { glyph: G.toolErr,    label: 'error',   color: t.error };
    case 'system':
    default:           return { glyph: G.bullet,      label: 'system',  color: t.muted };
  }
}
