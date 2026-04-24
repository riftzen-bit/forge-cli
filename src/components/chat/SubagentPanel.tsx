// Live preview of spawned subagents. While 1-2 subs run we show the last
// few wrapped lines of their streamed thinking/reply. Once three or more
// subs run at once we collapse each to a single-line summary - otherwise the
// dynamic render region grows to dozens of lines and Ink's redraw clobbers
// terminal scrollback, producing visible scroll jitter.

import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../../ui/theme.js';
import { useTick } from './useTick.js';
import { chunkText } from './chunkText.js';
import type { SubPreview } from './types.js';

const SUB_COMPACT_LINES = 3;
const SUB_VERBOSE_LINES = 12;
const SUB_COLLAPSE_THRESHOLD = 3;

type Props = {
  subs: SubPreview[];
  verbose: boolean;
};

export function SubagentPanel({ subs, verbose }: Props) {
  const t = getTheme();
  const { now } = useTick(200);
  const cols = process.stdout.columns ?? 100;
  const width = Math.max(40, cols - 10);
  const maxLines = verbose ? SUB_VERBOSE_LINES : SUB_COMPACT_LINES;
  const collapse = !verbose && subs.length >= SUB_COLLAPSE_THRESHOLD;

  if (collapse) {
    return (
      <Box flexDirection="column" marginTop={1}>
        {subs.map((s) => {
          const source = s.text ? 'reply' : 'thinking';
          const stream = (s.text || s.thinking).replace(/\s+/g, ' ').trim();
          const elapsed = ((now - s.startedAt) / 1000).toFixed(1);
          return (
            <Box key={s.tag}>
              <Text color={t.accentDim}>[{s.tag}]</Text>
              <Text color={t.muted}> {source}  {elapsed}s  ({stream.length} chars, ctrl+o expand)</Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {subs.map((s) => {
        const source = s.text ? 'reply' : 'thinking';
        const stream = (s.text || s.thinking).replace(/\s+/g, ' ').trim();
        const chunks = chunkText(stream, width);
        const visible = chunks.slice(-maxLines);
        const hidden = chunks.length - visible.length;
        const elapsed = ((now - s.startedAt) / 1000).toFixed(1);
        return (
          <Box key={s.tag} flexDirection="column">
            <Box>
              <Text color={t.accentDim}>[{s.tag}]</Text>
              <Text color={t.muted}> {source}  {elapsed}s  ({stream.length} chars)</Text>
            </Box>
            {visible.map((ln, i) => (
              <Box key={i} paddingLeft={2}>
                <Text color={t.muted} italic>{ln}</Text>
              </Box>
            ))}
            {hidden > 0 && (
              <Box paddingLeft={2}>
                <Text color={t.muted}>... +{hidden} line{hidden === 1 ? '' : 's'} (ctrl+o expand)</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
