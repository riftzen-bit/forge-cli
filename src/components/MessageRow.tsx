import React from 'react';
import { Box, Text } from 'ink';
import { Diff, computeDiffStats } from './Diff.js';
import type { ChatMessage } from './MessageList.js';
import { getTheme } from '../ui/theme.js';
import { figures } from '../ui/figures.js';

type Props = { message: ChatMessage; verbose?: boolean };

function toolDiff(tool: string, input: Record<string, unknown>): { old: string; next: string } | null {
  const base = baseTool(tool);
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

function baseTool(tool: string): string {
  return tool.replace(/^\[[^\]]+\]\s*/, '');
}

function tagOf(tool: string): string | undefined {
  return tool.match(/^\[([^\]]+)\]/)?.[1];
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

export function MessageRow({ message: m, verbose = false }: Props) {
  const t = getTheme();

  if (m.role === 'user') {
    return (
      <Box flexDirection="column" marginBottom={1} paddingX={1}>
        <Box>
          <Text color={t.subtle}>{figures.pointer} </Text>
          <Text backgroundColor={t.userMessageBackground} color={t.text}> {m.text} </Text>
        </Box>
      </Box>
    );
  }
  if (m.role === 'assistant') {
    return (
      <Box flexDirection="column" marginBottom={1} paddingX={1}>
        <Box>
          <Text color={t.claude} bold>{figures.bullet} </Text>
          <Text>{m.text}</Text>
        </Box>
      </Box>
    );
  }
  if (m.role === 'thinking') {
    const display = verbose ? m.text : m.text.length > 800 ? m.text.slice(0, 800) + figures.ellipsis : m.text;
    return (
      <Box flexDirection="column" marginBottom={1} paddingX={1}>
        <Box>
          <Text color={t.subtle} italic>Thought </Text>
          <Text color={t.subtle} dimColor>({m.text.length} chars)</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text color={t.subtle} italic>{display}</Text>
        </Box>
      </Box>
    );
  }
  if (m.role === 'tool') {
    const base = baseTool(m.tool);
    const tag = tagOf(m.tool);
    const tagPrefix = tag ? `[${tag}] ` : '';
    const diff = toolDiff(m.tool, m.input);
    const filePath = typeof m.input['file_path'] === 'string' ? (m.input['file_path'] as string) : undefined;

    if (base === 'Edit' && diff) {
      const { adds, dels } = computeDiffStats(diff.old, diff.next);
      return (
        <Box flexDirection="column" marginBottom={1} paddingX={1}>
          <Box>
            <Text color={t.claude}>{figures.bullet} </Text>
            <Text bold>{tagPrefix}Update</Text>
            <Text color={t.subtle}> ({filePath ?? m.text})</Text>
          </Box>
          <Box paddingLeft={2}>
            <Text color={t.subtle}>{`${figures.corner} Added ${adds} line${adds === 1 ? '' : 's'}, removed ${dels} line${dels === 1 ? '' : 's'}`}</Text>
          </Box>
          <Diff oldText={diff.old} newText={diff.next} />
        </Box>
      );
    }
    if (base === 'Write' && diff) {
      const lineCount = diff.next.split(/\r?\n/).length;
      return (
        <Box flexDirection="column" marginBottom={1} paddingX={1}>
          <Box>
            <Text color={t.claude}>{figures.bullet} </Text>
            <Text bold>{tagPrefix}Create</Text>
            <Text color={t.subtle}> ({filePath ?? m.text})</Text>
          </Box>
          <Box paddingLeft={2}>
            <Text color={t.subtle}>{`${figures.corner} Wrote ${lineCount} line${lineCount === 1 ? '' : 's'}`}</Text>
          </Box>
          {verbose && <Diff oldText="" newText={diff.next} />}
        </Box>
      );
    }

    return (
      <Box flexDirection="column" marginBottom={1} paddingX={1}>
        <Box>
          <Text color={t.claude}>{figures.bullet} </Text>
          <Text bold>{m.tool}</Text>
          <Text color={t.subtle}>  {m.text}</Text>
        </Box>
        {verbose && (
          <Box flexDirection="column" paddingLeft={4} marginTop={0}>
            {formatToolInput(m.input).map((line, j) => (
              <Text key={j} color={t.subtle}>{line}</Text>
            ))}
          </Box>
        )}
      </Box>
    );
  }
  if (m.role === 'system') {
    return (
      <Box marginBottom={1} paddingX={1}>
        <Text color={t.subtle}>{figures.arrowRight} {m.text}</Text>
      </Box>
    );
  }
  return (
    <Box marginBottom={1} paddingX={1}>
      <Text color={t.error}>{figures.cross} {m.text}</Text>
    </Box>
  );
}
