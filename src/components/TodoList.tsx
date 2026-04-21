import React from 'react';
import { Box, Text } from 'ink';
import type { Todo } from '../agent/todos.js';

type Props = { todos: Todo[] };

export function TodoList({ todos }: Props) {
  if (todos.length === 0) return null;
  return (
    <Box flexDirection="column" paddingX={2} marginTop={1} borderStyle="round" borderColor="gray">
      <Text color="cyan" bold>todos</Text>
      {todos.map((t) => (
        <Box key={t.id}>
          <Text color={markColor(t.status)}>{mark(t.status)} </Text>
          <Text dimColor>{t.id}. </Text>
          <Text strikethrough={t.status === 'done'} color={t.status === 'done' ? 'gray' : undefined}>
            {t.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function mark(s: Todo['status']): string {
  if (s === 'done') return '✓';
  if (s === 'doing') return '◐';
  return '○';
}

function markColor(s: Todo['status']): 'green' | 'yellow' | 'gray' {
  if (s === 'done') return 'green';
  if (s === 'doing') return 'yellow';
  return 'gray';
}
