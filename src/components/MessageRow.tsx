import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Diff, computeDiffStats } from './Diff.js';
import type { ChatMessage } from './MessageList.js';
import { getTheme } from '../ui/theme.js';
import { baseToolName, displayName } from './toolFormat.js';
import { Markdown } from './Markdown.js';

type Props = { message: ChatMessage; verbose?: boolean };

function tagOf(tool: string): string | undefined {
  const m = tool.match(/^\[([^\]]+)\]/);
  return m?.[1];
}

function toolDiff(tool: string, input: Record<string, unknown>): { old: string; next: string } | null {
  const base = baseToolName(tool);
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

function statusGlyph(status: 'run' | 'ok' | 'err' | undefined, t: ReturnType<typeof getTheme>) {
  if (!status || status === 'run') return <Text color={t.warn}>●</Text>;
  if (status === 'ok') return <Text color={t.success}>●</Text>;
  return <Text color={t.error}>●</Text>;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Strip leading `N->` line-number gutter that Read emits, and truncate to 1 line.
function cleanPreview(s: string): string {
  const first = s.split(/\r?\n/, 1)[0] ?? '';
  const stripped = first.replace(/^\s*\d+\s*(?:→|->)\s*/, '');
  return stripped.length > 120 ? stripped.slice(0, 117) + '...' : stripped;
}

export const MessageRow = memo(function MessageRow({ message: m, verbose = false }: Props) {
  const t = getTheme();

  if (m.role === 'user') {
    return (
      <Box flexDirection="column" marginBottom={1} marginTop={1}>
        <Box>
          <Text color={t.info} bold>{'> '}</Text>
          <Text color={t.info}>you</Text>
        </Box>
        <Box
          borderStyle="single"
          borderLeft
          borderTop={false}
          borderRight={false}
          borderBottom={false}
          borderColor={t.info}
          paddingLeft={1}
        >
          <Text color={t.text}>{m.text}</Text>
        </Box>
      </Box>
    );
  }
  if (m.role === 'assistant') {
    return (
      <Box flexDirection="column" marginBottom={1} marginTop={1}>
        <Box>
          <Text color={t.accent} bold>{'* '}</Text>
          <Text color={t.accent}>forge</Text>
        </Box>
        <Box
          borderStyle="single"
          borderLeft
          borderTop={false}
          borderRight={false}
          borderBottom={false}
          borderColor={t.accent}
          paddingLeft={1}
        >
          <Markdown text={m.text} color={t.text} />
        </Box>
      </Box>
    );
  }
  if (m.role === 'thinking') {
    const display = verbose ? m.text : m.text.length > 800 ? m.text.slice(0, 800) + '...' : m.text;
    return (
      <Box
        flexDirection="column"
        marginBottom={1}
        borderStyle="single"
        borderLeft
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        borderColor={t.muted}
        paddingLeft={1}
      >
        <Text color={t.muted}>thought ({m.text.length} chars)</Text>
        <Text color={t.muted} italic>{display}</Text>
      </Box>
    );
  }
  if (m.role === 'tool') {
    const base = baseToolName(m.tool);
    const tag = tagOf(m.tool);
    const tagPrefix = tag ? `[${tag}] ` : '';
    const diff = toolDiff(m.tool, m.input);
    const name = displayName(m.tool);

    let stats = '';
    if (diff && base === 'Edit') {
      const { adds, dels } = computeDiffStats(diff.old, diff.next);
      stats = ` +${adds} -${dels}`;
    } else if (diff && base === 'Write') {
      const { adds } = computeDiffStats(diff.old, diff.next);
      stats = ` +${adds}`;
    }

    const args = m.text ?? '';
    const dur = m.ms !== undefined ? formatMs(m.ms) : '';

    return (
      <Box flexDirection="column">
        <Box>
          {statusGlyph(m.status, t)}
          <Text color={t.muted}> {tagPrefix}</Text>
          <Text color={t.toolTag} bold>{name}</Text>
          <Text color={t.text}>({args})</Text>
          {stats && <Text color={t.accentDim}>{stats}</Text>}
          {dur && <Text color={t.muted}>  {dur}</Text>}
        </Box>
        {diff && base === 'Edit' && <Diff oldText={diff.old} newText={diff.next} verbose={verbose} />}
        {verbose && diff && base === 'Write' && <Diff oldText={diff.old} newText={diff.next} verbose />}
        {verbose && !diff && (
          <Box flexDirection="column" paddingLeft={2}>
            {formatToolInput(m.input).map((line, j) => (
              <Text key={j} color={t.muted}>{line}</Text>
            ))}
          </Box>
        )}
        {m.status === 'ok' && m.output && !diff && (
          <Box paddingLeft={2}>
            <Text color={t.muted}>{'  └ '}{cleanPreview(m.output)}</Text>
          </Box>
        )}
        {m.status === 'err' && m.output && (
          <Box paddingLeft={2}>
            <Text color={t.error}>{'  └ '}{cleanPreview(m.output)}</Text>
          </Box>
        )}
      </Box>
    );
  }
  if (m.role === 'shell') {
    const ok = m.code === 0;
    const stdout = m.stdout.replace(/\s+$/, '');
    const stderr = m.stderr.replace(/\s+$/, '');
    const lines = stdout ? stdout.split(/\r?\n/) : [];
    const errLines = stderr ? stderr.split(/\r?\n/) : [];
    const maxOut = verbose ? 200 : 30;
    const visibleOut = lines.slice(0, maxOut);
    const hiddenOut = lines.length - visibleOut.length;
    const visibleErr = errLines.slice(0, verbose ? 60 : 10);
    const hiddenErr = errLines.length - visibleErr.length;
    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Box>
          <Text color={ok ? t.success : t.error} bold>$ </Text>
          <Text color={t.text}>{m.command}</Text>
          <Text color={t.muted}>  exit {m.code}  {formatMs(m.ms)}</Text>
        </Box>
        <Box
          flexDirection="column"
          borderStyle="single"
          borderLeft
          borderTop={false}
          borderRight={false}
          borderBottom={false}
          borderColor={ok ? t.muted : t.error}
          paddingLeft={1}
        >
          {visibleOut.map((ln, i) => (
            <Text key={`o${i}`} color={t.text}>{ln || ' '}</Text>
          ))}
          {hiddenOut > 0 && (
            <Text color={t.muted}>... +{hiddenOut} line{hiddenOut === 1 ? '' : 's'} (ctrl+o to expand)</Text>
          )}
          {visibleErr.map((ln, i) => (
            <Text key={`e${i}`} color={t.error}>{ln || ' '}</Text>
          ))}
          {hiddenErr > 0 && (
            <Text color={t.muted}>... +{hiddenErr} stderr line{hiddenErr === 1 ? '' : 's'}</Text>
          )}
          {visibleOut.length === 0 && visibleErr.length === 0 && (
            <Text color={t.muted}>(no output)</Text>
          )}
        </Box>
      </Box>
    );
  }
  if (m.role === 'system') {
    return (
      <Box flexDirection="column">
        {m.text.split(/\r?\n/).map((ln, i) => (
          <Text key={i} color={t.muted}>{i === 0 ? '· ' : '  '}{ln}</Text>
        ))}
      </Box>
    );
  }
  return (
    <Box>
      <Text color={t.error}>! {m.text}</Text>
    </Box>
  );
});
