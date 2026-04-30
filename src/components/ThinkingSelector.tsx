import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { THINKING_LEVELS, type Thinking } from '../agent/thinking.js';
import { getTheme } from '../ui/theme.js';

type Props = {
  current: Thinking;
  onSelect: (thinking: Thinking) => void;
  onCancel: () => void;
};

const HINT: Record<Thinking, string> = {
  Low: 'short reasoning for small edits',
  Medium: 'balanced default',
  High: 'more reasoning for hard work',
  'X-High': 'max Codex reasoning setting',
};

export function ThinkingSelector({ current, onSelect, onCancel }: Props) {
  const t = getTheme();
  const startIdx = Math.max(0, THINKING_LEVELS.indexOf(current));
  const [idx, setIdx] = useState(startIdx);

  useInput((_, key) => {
    if (key.upArrow) setIdx((i) => (i - 1 + THINKING_LEVELS.length) % THINKING_LEVELS.length);
    if (key.downArrow) setIdx((i) => (i + 1) % THINKING_LEVELS.length);
    if (key.return) onSelect(THINKING_LEVELS[idx]!);
    if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column">
      <Text color={t.accent} bold>-- ChatGPT thinking --</Text>
      <Text color={t.muted}>reasoning effort for ChatGPT/Codex models only</Text>
      <Box flexDirection="column" marginTop={1}>
        {THINKING_LEVELS.map((lvl, i) => {
          const focused = i === idx;
          const active = lvl === current;
          return (
            <Box key={lvl}>
              <Text color={focused ? t.accent : t.muted}>{focused ? '> ' : '  '}</Text>
              <Text color={focused ? t.accent : t.text} bold={focused}>{lvl.padEnd(9)}</Text>
              <Text color={t.muted}>{HINT[lvl]}</Text>
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