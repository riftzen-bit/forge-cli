import React from 'react';
import { Box, Text } from 'ink';
import type { Todo } from '../agent/todos.js';
import { getTheme } from '../ui/theme.js';

type Props = { todos: Todo[] };

export function TodoList({ todos }: Props) {
  if (todos.length === 0) return null;
  const t = getTheme();
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={t.accentDim}>todos:</Text>
      {todos.map((td) => (
        <Box key={td.id}>
          <Text color={markColor(td.status, t)}>  {mark(td.status)} </Text>
          <Text color={t.muted}>{td.id}. </Text>
          <Text
            color={td.status === 'done' ? t.muted : t.text}
            strikethrough={td.status === 'done'}
          >
            {td.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function mark(s: Todo['status']): string {
  if (s === 'done') return '[x]';
  if (s === 'doing') return '[~]';
  return '[ ]';
}

function markColor(s: Todo['status'], t: ReturnType<typeof getTheme>): string {
  if (s === 'done') return t.success;
  if (s === 'doing') return t.warn;
  return t.muted;
}
