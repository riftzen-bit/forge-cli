import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { MODELS, labelFor } from '../agent/models.js';

type Props = {
  current: string;
  onSelect: (id: string) => void;
  onCancel: () => void;
};

export function ModelSelector({ current, onSelect, onCancel }: Props) {
  const startIdx = Math.max(
    0,
    MODELS.findIndex((m) => m.id === current),
  );
  const [idx, setIdx] = useState(startIdx);

  useInput((_, key) => {
    if (key.upArrow)   setIdx((i) => (i - 1 + MODELS.length) % MODELS.length);
    if (key.downArrow) setIdx((i) => (i + 1) % MODELS.length);
    if (key.return)    onSelect(MODELS[idx]!.id);
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
          <Text color="cyan" bold>✻ </Text>
          <Text bold>Select Model</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>applies instantly to this session · also saved as default</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {MODELS.map((m, i) => {
            const focused = i === idx;
            const active = m.id === current;
            return (
              <Box key={m.id}>
                <Text color={focused ? 'cyan' : 'white'} bold={focused}>
                  {focused ? '❯ ' : '  '}
                  {m.label.padEnd(14)}
                </Text>
                <Text dimColor>{m.id}</Text>
                {active && <Text color="green">  ● active</Text>}
              </Box>
            );
          })}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>↑/↓ navigate · Enter apply · Esc cancel</Text>
        </Box>
      </Box>

      <Box paddingX={2} marginTop={1}>
        <Text dimColor>current: </Text>
        <Text color="cyan">{labelFor(current)}</Text>
      </Box>
    </Box>
  );
}
