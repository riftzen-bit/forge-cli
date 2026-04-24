import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';

type Props = {
  text?: string;
  verbose?: boolean;
  maxLines?: number;
  startedAt?: number;
};

const TICKS = ['|', '/', '-', '\\'];

export function ThinkingLine({ text, verbose = false, maxLines = 3, startedAt }: Props) {
  const t = getTheme();
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setTick((n) => (n + 1) % TICKS.length);
      setNow(Date.now());
    }, 250);
    return () => clearInterval(id);
  }, []);

  const condensed = text ? text.replace(/\s+/g, ' ').trim() : '';
  const width = Math.max(40, (process.stdout.columns ?? 100) - 6);
  const chunks: string[] = [];
  for (let i = 0; i < condensed.length; i += width) {
    chunks.push(condensed.slice(i, i + width));
  }
  const visible = verbose ? chunks : chunks.slice(-maxLines);
  const charCount = condensed.length;
  const elapsed = startedAt ? `${((now - startedAt) / 1000).toFixed(1)}s` : '';

  const label = charCount > 0 ? 'thinking' : 'working';
  const labelColor = charCount > 0 ? t.info : t.accentDim;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={t.accent}>{TICKS[tick]}</Text>
        <Text color={labelColor} bold> {label}</Text>
        {elapsed && <Text color={t.muted}> {elapsed}</Text>}
        {charCount > 0 && (
          <Text color={t.muted}>  ({charCount} chars{verbose ? '' : ', ctrl+o expand'})</Text>
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
