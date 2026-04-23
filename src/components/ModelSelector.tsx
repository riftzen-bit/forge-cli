import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { MODELS, labelFor } from '../agent/models.js';
import { getTheme } from '../ui/theme.js';

type Props = {
  current: string;
  onSelect: (id: string) => void;
  onCancel: () => void;
};

export function ModelSelector({ current, onSelect, onCancel }: Props) {
  const t = getTheme();
  const startIdx = Math.max(0, MODELS.findIndex((m) => m.id === current));
  const [idx, setIdx] = useState(startIdx);

  useInput((_, key) => {
    if (key.upArrow)   setIdx((i) => (i - 1 + MODELS.length) % MODELS.length);
    if (key.downArrow) setIdx((i) => (i + 1) % MODELS.length);
    if (key.return)    onSelect(MODELS[idx]!.id);
    if (key.escape)    onCancel();
  });

  return (
    <Box flexDirection="column">
      <Text color={t.accent} bold>-- select model --</Text>
      <Text color={t.muted}>applies to this session, saved as default</Text>
      <Box flexDirection="column" marginTop={1}>
        {MODELS.map((m, i) => {
          const focused = i === idx;
          const active = m.id === current;
          return (
            <Box key={m.id}>
              <Text color={focused ? t.accent : t.muted}>
                {focused ? '> ' : '  '}
              </Text>
              <Text color={focused ? t.accent : t.text} bold={focused}>
                {m.label.padEnd(14)}
              </Text>
              <Text color={t.muted}>{m.id}</Text>
              {active && <Text color={t.success}>  * active</Text>}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={t.muted}>up/dn move, enter apply, esc cancel -- current: </Text>
        <Text color={t.accent}>{labelFor(current)}</Text>
      </Box>
    </Box>
  );
}
