import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';
import { G } from '../ui/glyphs.js';
import { useTick, SPINNER_FRAMES } from './chat/useTick.js';

type Props = {
  text?: string;
  verbose?: boolean;
  maxLines?: number;
  startedAt?: number;
};

// Working/thinking indicator. Uses the shared braille spinner so it
// matches ActiveToolsPanel cadence — both panels read as one synchronised
// animation system instead of two competing ones.
export function ThinkingLine({ text, verbose = false, maxLines = 3, startedAt }: Props) {
  const t = getTheme();
  const { frame, now } = useTick(120);
  const spin = SPINNER_FRAMES[frame] ?? '';

  const condensed = text ? text.replace(/\s+/g, ' ').trim() : '';
  const width = Math.max(40, (process.stdout.columns ?? 100) - 6);
  const chunks: string[] = [];
  for (let i = 0; i < condensed.length; i += width) {
    chunks.push(condensed.slice(i, i + width));
  }
  const visible = verbose ? chunks : chunks.slice(-maxLines);
  const charCount = condensed.length;
  const elapsed = startedAt ? `${((now - startedAt) / 1000).toFixed(1)}s` : '';

  const isThinking = charCount > 0;
  const label = isThinking ? 'thinking' : 'working';
  const labelColor = isThinking ? t.info : t.accentDim;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={t.accent}>{spin} </Text>
        <Text color={labelColor} bold>{label}</Text>
        {elapsed && <Text color={t.muted}>  {G.bullet}  {elapsed}</Text>}
        {isThinking && (
          <Text color={t.muted}>  {G.bullet}  {charCount} chars{verbose ? '' : `, ctrl+o expand`}</Text>
        )}
      </Box>
      {visible.map((line, i) => (
        <Box key={i} paddingLeft={2}>
          <Text color={t.muted} italic>{line}</Text>
        </Box>
      ))}
    </Box>
  );
}
