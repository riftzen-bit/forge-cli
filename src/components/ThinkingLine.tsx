import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

type Props = {
  label: string;
  text?: string;
  verbose?: boolean;
  maxLines?: number;
};

export function ThinkingLine({ label, text, verbose = false, maxLines = 5 }: Props) {
  const condensed = text ? text.replace(/\s+/g, ' ').trim() : '';
  const width = Math.max(40, (process.stdout.columns ?? 100) - 6);
  const chunks: string[] = [];
  for (let i = 0; i < condensed.length; i += width) {
    chunks.push(condensed.slice(i, i + width));
  }
  const visible = verbose ? chunks : chunks.slice(-maxLines);
  const charCount = condensed.length;

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Box>
        <Text color="magenta" bold><Spinner type="star" /></Text>
        <Text color="magenta" bold italic> {label}…</Text>
        {charCount > 0 && <Text dimColor>  thinking · {charCount} chars</Text>}
      </Box>
      {visible.map((line, i) => (
        <Box key={i} paddingLeft={2}>
          <Text color="magenta" italic>{line}</Text>
        </Box>
      ))}
    </Box>
  );
}
