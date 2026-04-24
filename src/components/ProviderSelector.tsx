import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { PROVIDERS } from '../agent/providers.js';
import { getTheme } from '../ui/theme.js';

type Props = {
  current: string;
  hasKey: (id: string) => boolean;
  onSelect: (id: string) => void;
  onCancel: () => void;
};

export function ProviderSelector({ current, hasKey, onSelect, onCancel }: Props) {
  const t = getTheme();
  const startIdx = Math.max(0, PROVIDERS.findIndex((p) => p.id === current));
  const [idx, setIdx] = useState(startIdx);

  useInput((_, key) => {
    if (key.upArrow)   setIdx((i) => (i - 1 + PROVIDERS.length) % PROVIDERS.length);
    if (key.downArrow) setIdx((i) => (i + 1) % PROVIDERS.length);
    if (key.return)    onSelect(PROVIDERS[idx]!.id);
    if (key.escape)    onCancel();
  });

  return (
    <Box flexDirection="column">
      <Text color={t.accent} bold>-- select provider --</Text>
      <Text color={t.muted}>switches active API endpoint. use /login --provider &lt;id&gt; outside chat for new keys.</Text>
      <Box flexDirection="column" marginTop={1}>
        {PROVIDERS.map((p, i) => {
          const focused = i === idx;
          const active = p.id === current;
          const key = hasKey(p.id);
          const warn = !p.nativeAnthropic;
          return (
            <Box key={p.id}>
              <Text color={focused ? t.accent : t.muted}>
                {focused ? '> ' : '  '}
              </Text>
              <Text color={focused ? t.accent : t.text} bold={focused}>
                {p.label.padEnd(18)}
              </Text>
              <Text color={t.muted}>{p.id.padEnd(12)}</Text>
              {key ? (
                <Text color={t.success}>key </Text>
              ) : (
                <Text color={t.error}>no-key </Text>
              )}
              {warn && <Text color={t.warn}>proxy </Text>}
              {active && <Text color={t.success}>* active</Text>}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={t.muted}>up/dn move, enter apply, esc cancel</Text>
      </Box>
    </Box>
  );
}
