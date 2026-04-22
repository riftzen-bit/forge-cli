import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { EFFORT_LEVELS, EFFORT_BUDGET, type Effort } from '../agent/effort.js';

type Props = {
  current: Effort;
  onSelect: (effort: Effort) => void;
  onCancel: () => void;
};

export function EffortSelector({ current, onSelect, onCancel }: Props) {
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
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
      >
        <Box>
          <Text color="cyan" bold>* </Text>
          <Text bold>Thinking Effort</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>how much the model reasons before answering · applies live</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {EFFORT_LEVELS.map((lvl, i) => {
            const focused = i === idx;
            const active = lvl === current;
            const budget = EFFORT_BUDGET[lvl];
            return (
              <Box key={lvl}>
                <Text color={focused ? 'cyan' : 'white'} bold={focused}>
                  {focused ? '> ' : '  '}
                  {lvl.padEnd(8)}
                </Text>
                <Text dimColor>{String(budget).padStart(6)} thinking tokens</Text>
                {active && <Text color="green">  ● active</Text>}
              </Box>
            );
          })}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>up/dn navigate · Enter apply · Esc cancel</Text>
        </Box>
      </Box>

      <Box paddingX={2} marginTop={1}>
        <Text dimColor>current: </Text>
        <Text color="cyan">{current}</Text>
      </Box>
    </Box>
  );
}
