import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Diff, computeDiffStats } from './Diff.js';
import type { ChatMessage } from './MessageList.js';
import { getTheme } from '../ui/theme.js';
import { baseToolName, displayName, sanitizeToolOutput, shouldShowOkPreview } from './toolFormat.js';
import { Markdown } from './Markdown.js';
import { G } from '../ui/glyphs.js';
import { CellMarker } from './ui/CellMarker.js';

type Props = {
  message: ChatMessage;
  verbose?: boolean;
  isCellHead?: boolean;
};

// Indent for content rows under a role marker. 4 spaces ≈ width of the role
// glyph + space + "you|forge|step" — narrow enough to keep wrapped paragraph
// width sane on 80-col terminals.
const CELL_INDENT = 4;
// Tool body rows nest one extra indent under the tool summary line so the
// "└ preview" tree continuation stays visually inside the tool.
const TOOL_BODY_INDENT = CELL_INDENT + 2;

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
  if (!status || status === 'run') return <Text color={t.warn} bold>{G.toolRun}</Text>;
  if (status === 'ok') return <Text color={t.success} bold>{G.toolOk}</Text>;
  return <Text color={t.error} bold>{G.toolErr}</Text>;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatToolMs(ms: number): string {
  if (ms < 1000) return '';
  return `${(ms / 1000).toFixed(1)}s`;
}

function cleanPreview(s: string): string {
  const sanitized = sanitizeToolOutput(s);
  const first = sanitized.split(/\r?\n/, 1)[0] ?? '';
  const stripped = first.replace(/^\s*\d+\s*(?:→|->)\s*/, '');
  const cps = Array.from(stripped);
  return cps.length > 120 ? cps.slice(0, 117).join('') + '...' : stripped;
}

export const MessageRow = memo(function MessageRow({
  message: m,
  verbose = false,
  isCellHead = true,
}: Props) {
  const t = getTheme();

  if (m.role === 'user') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <CellMarker kind="user" />
        <Box paddingLeft={CELL_INDENT}>
          <Text color={t.text}>{m.text}</Text>
        </Box>
      </Box>
    );
  }
  if (m.role === 'assistant') {
    return (
      <Box flexDirection="column" marginTop={isCellHead ? 1 : 0}>
        {isCellHead && <CellMarker kind="assistant" />}
        <Box paddingLeft={CELL_INDENT}>
          <Markdown text={m.text} color={t.text} />
        </Box>
      </Box>
    );
  }
  if (m.role === 'thinking') {
    const display = verbose ? m.text : m.text.length > 800 ? m.text.slice(0, 800) + '...' : m.text;
    return (
      <Box flexDirection="column" marginTop={isCellHead ? 1 : 0}>
        {isCellHead && <CellMarker kind="step" meta="reasoning" />}
        <Box paddingLeft={CELL_INDENT}>
          <Text color={t.muted} italic>{display}</Text>
        </Box>
      </Box>
    );
  }
  if (m.role === 'tool') {
    const base = baseToolName(m.tool);
    const tag = tagOf(m.tool);
    const tagPrefix = tag ? `[${tag}] ` : '';
    const diff = toolDiff(m.tool, m.input);

    let stats = '';
    if (diff && base === 'Edit') {
      const { adds, dels } = computeDiffStats(diff.old, diff.next);
      stats = `+${adds} -${dels}`;
    } else if (diff && base === 'Write') {
      const { adds } = computeDiffStats(diff.old, diff.next);
      stats = `+${adds}`;
    }

    const args = m.text ?? '';
    const name = displayName(m.tool);
    const summary = args ? `${name} ${args}` : name;
    const dur = m.ms !== undefined ? formatToolMs(m.ms) : '';
    const showOkPreview = m.status === 'ok' && m.output && !diff && (verbose || shouldShowOkPreview(m.tool));
    // Write to a brand-new file: showing the diff is just dumping the file.
    // Collapse to a one-line summary unless verbose. Edit still shows the
    // diff because the changes ARE the signal.
    const isFreshWrite = base === 'Write' && diff !== null && diff.old === '';
    const showDiff = diff !== null && (base === 'Edit' || (base === 'Write' && verbose && !isFreshWrite));

    return (
      <Box flexDirection="column" marginTop={isCellHead ? 1 : 0}>
        {isCellHead && <CellMarker kind="step" meta="tool" />}
        <Box paddingLeft={CELL_INDENT}>
          {statusGlyph(m.status, t)}
          <Text> </Text>
          {tagPrefix && <Text color={t.accentDim}>{tagPrefix}</Text>}
          <Text color={t.text}>{summary}</Text>
          {stats && <Text color={t.accentDim}>  {stats}</Text>}
          {dur && <Text color={t.muted}>  {G.bullet}  {dur}</Text>}
        </Box>
        {showDiff && diff && (
          <Box paddingLeft={CELL_INDENT}>
            <Diff oldText={diff.old} newText={diff.next} verbose={verbose} />
          </Box>
        )}
        {verbose && !diff && (
          <Box flexDirection="column" paddingLeft={TOOL_BODY_INDENT}>
            {formatToolInput(m.input).map((line, j) => (
              <Text key={j} color={t.muted}>{line}</Text>
            ))}
          </Box>
        )}
        {showOkPreview && (
          <Box paddingLeft={TOOL_BODY_INDENT}>
            <Text color={t.muted}>{G.branchEnd} {cleanPreview(m.output!)}</Text>
          </Box>
        )}
        {m.status === 'err' && m.output && (
          <Box paddingLeft={TOOL_BODY_INDENT}>
            <Text color={t.error}>{G.branchEnd} {cleanPreview(m.output)}</Text>
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
      <Box flexDirection="column" marginTop={isCellHead ? 1 : 0}>
        {isCellHead && <CellMarker kind="step" meta="shell" />}
        <Box paddingLeft={CELL_INDENT}>
          <Text color={ok ? t.success : t.error} bold>$ </Text>
          <Text color={t.text}>{m.command}</Text>
          <Text color={t.muted}>  exit {m.code}  {formatMs(m.ms)}</Text>
        </Box>
        <Box flexDirection="column" paddingLeft={TOOL_BODY_INDENT}>
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
          <Text key={i} color={t.muted}>{`# ${ln}`}</Text>
        ))}
      </Box>
    );
  }
  return (
    <Box>
      <Text color={t.error} bold>{G.toolErr} </Text>
      <Text color={t.error}>{m.text}</Text>
    </Box>
  );
});
