import React from 'react';
import { Box, Text } from 'ink';

type Props = { oldText: string; newText: string; contextLines?: number; maxLines?: number };

type DLine =
  | { kind: 'ctx'; text: string; oldNo?: number; newNo?: number }
  | { kind: 'del'; text: string; oldNo: number }
  | { kind: 'add'; text: string; newNo: number }
  | { kind: 'gap' };

const ADD_BG = '#14532d';
const DEL_BG = '#5b1a1a';

export function computeDiffStats(oldText: string, newText: string): { adds: number; dels: number } {
  const a = oldText.split(/\r?\n/);
  const b = newText.split(/\r?\n/);
  const lcs = lcsMatrix(a, b);
  let i = a.length;
  let j = b.length;
  let adds = 0;
  let dels = 0;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { i--; j--; }
    else if ((lcs[i - 1]?.[j] ?? 0) >= (lcs[i]?.[j - 1] ?? 0)) { dels++; i--; }
    else { adds++; j--; }
  }
  while (i > 0) { dels++; i--; }
  while (j > 0) { adds++; j--; }
  return { adds, dels };
}

export function Diff({ oldText, newText, contextLines = 3, maxLines = 24 }: Props) {
  const lines = computeDiff(oldText, newText, contextLines);
  if (lines.length === 0) return null;

  const truncated = lines.length > maxLines;
  const shown = truncated ? lines.slice(0, maxLines) : lines;
  const hidden = lines.length - shown.length;

  const maxNo = Math.max(
    1,
    ...lines.flatMap((l) => {
      if (l.kind === 'del') return [l.oldNo];
      if (l.kind === 'add') return [l.newNo];
      if (l.kind === 'ctx') return [l.oldNo ?? 0, l.newNo ?? 0];
      return [0];
    }),
  );
  const numW = String(maxNo).length;
  const termCols = Math.max(40, (process.stdout.columns ?? 100) - 2);

  return (
    <Box flexDirection="column" paddingLeft={4}>
      {shown.map((l, i) => renderLine(l, i, numW, termCols))}
      {truncated && (
        <Text dimColor>{`  … ${hidden} more line${hidden === 1 ? '' : 's'}`}</Text>
      )}
    </Box>
  );
}

function renderLine(l: DLine, key: number, numW: number, cols: number) {
  if (l.kind === 'gap') {
    return (
      <Text key={key} dimColor>{`${' '.repeat(numW)}   …`}</Text>
    );
  }
  if (l.kind === 'ctx') {
    const no = (l.newNo ?? l.oldNo ?? 0).toString().padStart(numW, ' ');
    return (
      <Box key={key}>
        <Text dimColor>{`${no}   `}</Text>
        <Text>{l.text}</Text>
      </Box>
    );
  }
  const sign = l.kind === 'add' ? '+' : '-';
  const no = (l.kind === 'add' ? l.newNo : l.oldNo).toString().padStart(numW, ' ');
  const bg = l.kind === 'add' ? ADD_BG : DEL_BG;
  const content = ` ${no} ${sign} ${l.text}`;
  const padded = content.length < cols ? content + ' '.repeat(cols - content.length) : content;
  return (
    <Text key={key} backgroundColor={bg}>{padded}</Text>
  );
}

function computeDiff(a: string, b: string, ctx: number): DLine[] {
  const oldLines = a.split(/\r?\n/);
  const newLines = b.split(/\r?\n/);
  const lcs = lcsMatrix(oldLines, newLines);
  const all: DLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      all.unshift({ kind: 'ctx', text: oldLines[i - 1]!, oldNo: i, newNo: j });
      i--; j--;
    } else if ((lcs[i - 1]?.[j] ?? 0) >= (lcs[i]?.[j - 1] ?? 0)) {
      all.unshift({ kind: 'del', text: oldLines[i - 1]!, oldNo: i });
      i--;
    } else {
      all.unshift({ kind: 'add', text: newLines[j - 1]!, newNo: j });
      j--;
    }
  }
  while (i > 0) { all.unshift({ kind: 'del', text: oldLines[i - 1]!, oldNo: i }); i--; }
  while (j > 0) { all.unshift({ kind: 'add', text: newLines[j - 1]!, newNo: j }); j--; }
  return collapseContext(all, ctx);
}

function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      else dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
    }
  }
  return dp;
}

function collapseContext(lines: DLine[], ctx: number): DLine[] {
  const changed = new Set<number>();
  lines.forEach((l, i) => { if (l.kind !== 'ctx') changed.add(i); });
  if (changed.size === 0) return [];
  const keep = new Set<number>();
  for (const i of changed) {
    for (let k = Math.max(0, i - ctx); k <= Math.min(lines.length - 1, i + ctx); k++) keep.add(k);
  }
  const out: DLine[] = [];
  let lastKept = -2;
  for (let i = 0; i < lines.length; i++) {
    if (!keep.has(i)) continue;
    if (lastKept !== -2 && i - lastKept > 1) out.push({ kind: 'gap' });
    out.push(lines[i]!);
    lastKept = i;
  }
  return out;
}
