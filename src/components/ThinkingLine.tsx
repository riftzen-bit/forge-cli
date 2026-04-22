import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { getTheme } from '../ui/theme.js';

type Props = {
  label: string;
  text?: string;
  verbose?: boolean;
  maxLines?: number;
};

export function ThinkingLine({ label, text, verbose = false, maxLines = 5 }: Props) {
  const t = getTheme();
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
        <Text color={t.claude} bold><Spinner type="dots" /></Text>
        <Text color={t.claude} italic> {label}</Text>
        <Text color={t.subtle}>... </Text>
        {charCount > 0 && (
          <Text color={t.subtle}>({charCount} chars, ctrl+o to expand)</Text>
        )}
      </Box>
      {visible.map((line, i) => (
        <Box key={i} paddingLeft={2}>
          <Text color={t.subtle} italic>{line}</Text>
        </Box>
      ))}
    </Box>
  );
}
