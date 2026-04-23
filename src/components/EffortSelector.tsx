import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { EFFORT_LEVELS, EFFORT_BUDGET, type Effort } from '../agent/effort.js';
import { getTheme } from '../ui/theme.js';

type Props = {
  current: Effort;
  onSelect: (effort: Effort) => void;
  onCancel: () => void;
};

export function EffortSelector({ current, onSelect, onCancel }: Props) {
  const t = getTheme();
  const startIdx = Math.max(0, EFFORT_LEVELS.indexOf(current));
  const [idx, setIdx] = useState(startIdx);

  useInput((_, key) => {
    if (key.upArrow)   setIdx((i) => (i - 1 + EFFORT_LEVELS.length) % EFFORT_LEVELS.length);
    if (key.downArrow) setIdx((i) => (i + 1) % EFFORT_LEVELS.length);
    if (key.return)    onSelect(EFFORT_LEVELS[idx]!);
    if (key.escape)    onCancel();
  });

  return (
    <Box flexDirection="column">
      <Text color={t.accent} bold>-- thinking effort --</Text>
      <Text color={t.muted}>how much the model reasons before answering</Text>
      <Box flexDirection="column" marginTop={1}>
        {EFFORT_LEVELS.map((lvl, i) => {
          const focused = i === idx;
          const active = lvl === current;
          const budget = EFFORT_BUDGET[lvl];
          return (
            <Box key={lvl}>
              <Text color={focused ? t.accent : t.muted}>
                {focused ? '> ' : '  '}
              </Text>
              <Text color={focused ? t.accent : t.text} bold={focused}>
                {lvl.padEnd(8)}
              </Text>
              <Text color={t.muted}>{String(budget).padStart(6)} thinking tokens</Text>
              {active && <Text color={t.success}>  * active</Text>}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={t.muted}>up/dn move, enter apply, esc cancel -- current: </Text>
        <Text color={t.accent}>{current}</Text>
      </Box>
    </Box>
  );
}
