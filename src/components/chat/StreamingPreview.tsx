// Live preview of the main agent's streamed reply. We chunk the text into
// terminal-width slices and only render the last few, matching the pattern
// used by ThinkingLine and SubagentPanel so the dynamic region height stays
// bounded regardless of total reply length.

import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../../ui/theme.js';
import { chunkText } from './chunkText.js';
import { usePulse, PULSE_FRAMES } from './useTick.js';
import { G } from '../../ui/glyphs.js';

const STREAM_COMPACT_LINES = 3;
const STREAM_VERBOSE_LINES = 12;

type Props = {
  text: string;
  verbose: boolean;
};

export function StreamingPreview({ text, verbose }: Props) {
  const t = getTheme();
  const { frame } = usePulse(220);
  const beat = PULSE_FRAMES[frame] ?? G.star;
  const cols = process.stdout.columns ?? 100;
  const width = Math.max(40, cols - 4);
  const condensed = text.replace(/\s+/g, ' ').trim();
  const chunks = chunkText(condensed, width);
  const maxLines = verbose ? STREAM_VERBOSE_LINES : STREAM_COMPACT_LINES;
  const visible = chunks.slice(-maxLines);
  const hidden = chunks.length - visible.length;
  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Box>
        <Text color={t.accent}>{beat} </Text>
        <Text color={t.accent} bold>forge</Text>
        <Text color={t.muted}>  {G.bullet}  streaming  {G.bullet}  {condensed.length} chars</Text>
        {!verbose && <Text color={t.muted}>  {G.bullet}  ctrl+o expand</Text>}
      </Box>
      {visible.map((ln, i) => (
        <Text key={i} color={t.text} dimColor>{ln}</Text>
      ))}
      {hidden > 0 && (
        <Text color={t.muted}>{G.ellipsis} +{hidden} line{hidden === 1 ? '' : 's'}</Text>
      )}
    </Box>
  );
}
