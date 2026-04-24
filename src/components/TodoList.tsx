import React, { memo } from 'react';
import { Box, Text } from 'ink';
import type { Todo } from '../agent/todos.js';
import { getTheme } from '../ui/theme.js';

type Props = { todos: Todo[] };

export const TodoList = memo(TodoListImpl, (prev, next) => {
  if (prev.todos === next.todos) return true;
  if (prev.todos.length !== next.todos.length) return false;
  for (let i = 0; i < prev.todos.length; i++) {
    const a = prev.todos[i]!;
    const b = next.todos[i]!;
    if (a.id !== b.id || a.status !== b.status || a.text !== b.text) return false;
  }
  return true;
});

function TodoListImpl({ todos }: Props) {
  if (todos.length === 0) return null;
  const t = getTheme();
  const done = todos.filter((td) => td.status === 'done').length;
  const total = todos.length;

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={t.accentDim}
      paddingX={1}
    >
      <Box>
        <Text color={t.accent} bold>Todos</Text>
        <Text color={t.muted}> · {done}/{total}</Text>
      </Box>
      {todos.map((td) => (
        <Box key={td.id}>
          <Text color={markColor(td.status, t)} bold>{mark(td.status)}</Text>
          <Text> </Text>
          <Text
            color={td.status === 'done' ? t.muted : td.status === 'doing' ? t.warn : t.text}
            strikethrough={td.status === 'done'}
            bold={td.status === 'doing'}
            wrap="wrap"
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
  if (s === 'doing') return '[>]';
  return '[ ]';
}

function markColor(s: Todo['status'], t: ReturnType<typeof getTheme>): string {
  if (s === 'done') return t.success;
  if (s === 'doing') return t.warn;
  return t.muted;
}
