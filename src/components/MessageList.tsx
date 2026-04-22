import React from 'react';
import { Box, Text } from 'ink';
import { Diff } from './Diff.js';

export type ChatMessage =
  | { role: 'user' | 'assistant' | 'system' | 'error' | 'thinking'; text: string }
  | { role: 'tool'; text: string; tool: string; input: Record<string, unknown> };

type Props = { messages: ChatMessage[]; verbose?: boolean };

function toolDiff(tool: string, input: Record<string, unknown>): { old: string; next: string } | null {
  const base = tool.replace(/^\[[^\]]+\]\s*/, '');
  if (base === 'Edit') {
    const o = input['old_string'];
    const n = input['new_string'];
    if (typeof o === 'string' && typeof n === 'string') return { old: o, next: n };
  }
  if (base === 'Write') {
    const c = input['content'];
    if (typeof c === 'string') return { old: '', next: c };
  }
  return null;
}

function formatToolInput(input: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    const raw = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
    const parts = raw.split(/\r?\n/);
    if (parts.length === 1) {
      lines.push(`${k}: ${parts[0]}`);
    } else {
      lines.push(`${k}:`);
      for (const p of parts) lines.push(`  ${p}`);
    }
  }
  return lines;
}

export function MessageList({ messages, verbose = false }: Props) {
  return (
    <Box flexDirection="column">
      {messages.map((m, i) => {
        const last = i === messages.length - 1;
        const spacing = last ? 0 : 1;

        if (m.role === 'user') {
          return (
            <Box key={i} flexDirection="column" marginBottom={spacing} paddingX={1}>
              <Text backgroundColor="gray" color="white"> {m.text} </Text>
            </Box>
          );
        }
        if (m.role === 'assistant') {
          return (
            <Box key={i} flexDirection="column" marginBottom={spacing} paddingX={1}>
              <Box>
                <Text color="cyan" bold>* </Text>
                <Text color="cyan">{m.text}</Text>
              </Box>
            </Box>
          );
        }
        if (m.role === 'thinking') {
          const display = verbose ? m.text : m.text.length > 200 ? m.text.slice(0, 200) + '...' : m.text;
          return (
            <Box key={i} flexDirection="column" marginBottom={spacing} paddingX={1}>
              <Text color="gray" italic>* {display}</Text>
            </Box>
          );
        }
        if (m.role === 'tool') {
          const diff = toolDiff(m.tool, m.input);
          return (
            <Box key={i} flexDirection="column" marginBottom={spacing} paddingX={1}>
              <Box>
                <Text color="magenta">· </Text>
                <Text color="magenta" bold>{m.tool}</Text>
                <Text dimColor>  {m.text}</Text>
              </Box>
              {diff && <Diff oldText={diff.old} newText={diff.next} />}
              {verbose && !diff && (
                <Box flexDirection="column" paddingLeft={4} marginTop={0}>
                  {formatToolInput(m.input).map((line, j) => (
                    <Text key={j} dimColor>{line}</Text>
                  ))}
                </Box>
              )}
            </Box>
          );
        }
        if (m.role === 'system') {
          return (
            <Box key={i} marginBottom={spacing} paddingX={1}>
              <Text dimColor>· {m.text}</Text>
            </Box>
          );
        }
        return (
          <Box key={i} marginBottom={spacing} paddingX={1}>
            <Text color="red">x {m.text}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
