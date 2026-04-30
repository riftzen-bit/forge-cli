// Live "forge" panel with chunk-by-chunk render and a blinking cursor.
// Mirrors how the final committed message will look once the turn settles.
// The blinking ▊ block makes it visually obvious that text is still
// arriving, even when the network goes quiet for half a second.

import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../../ui/theme.js';
import { chunkText } from './chunkText.js';
import { CellMarker } from '../ui/CellMarker.js';

// Indent used by every message row. Matches MessageRow's CELL_INDENT.
const CELL_INDENT = 4;
const STREAM_COMPACT_LINES = 6;
const STREAM_VERBOSE_LINES = 16;
const CURSOR_BLINK_MS = 480;

type Props = {
  text: string;
  verbose: boolean;
};

function useBlink(ms: number): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), ms);
    return () => clearInterval(id);
  }, [ms]);
  return on;
}

export function StreamingPreview({ text, verbose }: Props) {
  const t = getTheme();
  const cursorOn = useBlink(CURSOR_BLINK_MS);
  const cols = process.stdout.columns ?? 100;
  const width = Math.max(40, cols - CELL_INDENT - 2);
  const condensed = text.replace(/\s+/g, ' ').trim();
  const chunks = chunkText(condensed, width);
  const maxLines = verbose ? STREAM_VERBOSE_LINES : STREAM_COMPACT_LINES;
  const visible = chunks.slice(-maxLines);
  const hidden = chunks.length - visible.length;
  const lastIdx = visible.length - 1;
  const cursor = cursorOn ? '\u258a' : ' ';
  return (
    <Box flexDirection="column">
      <CellMarker kind="assistant" meta="streaming" />
      {visible.map((ln, i) => {
        const isLast = i === lastIdx;
        return (
          <Box key={i} paddingLeft={CELL_INDENT}>
            <Text color={t.text}>
              {ln}
              {isLast && <Text color={t.accent} bold>{cursor}</Text>}
            </Text>
          </Box>
        );
      })}
      {visible.length === 0 && (
        <Box paddingLeft={CELL_INDENT}>
          <Text color={t.accent} bold>{cursor}</Text>
        </Box>
      )}
      {hidden > 0 && (
        <Box paddingLeft={CELL_INDENT}>
          <Text color={t.muted}>… +{hidden} earlier line{hidden === 1 ? '' : 's'}</Text>
        </Box>
      )}
    </Box>
  );
}
