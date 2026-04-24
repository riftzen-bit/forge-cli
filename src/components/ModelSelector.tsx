// Model picker with grouping by provider, auth-based filtering, fuzzy
// search, and a scrollable viewport. Replaces the earlier flat list which
// scaled badly past ~10 models.
//
// View modes:
//   - Browse: providers shown as headers, the one containing the cursor is
//     expanded, the rest collapsed to a "(N models)" summary. Arrow keys
//     move through models within the expanded group, skipping over headers
//     of collapsed groups; Left collapses, Right/Enter-on-header expands.
//   - Search: any printable key starts a query. The list flattens to every
//     model whose label/id matches (case-insensitive substring). Headers
//     are hidden. Backspace edits; clearing the query returns to browse.
//
// Auth filter:
//   Only providers in `providerKeys` are listed. The active provider is
//   always included even without a key so the user can see what is
//   currently set — otherwise the picker could be empty right after a
//   /provider switch.

import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { MODELS, labelFor, type ModelEntry } from '../agent/models.js';
import { PROVIDERS, providerFor } from '../agent/providers.js';
import { getTheme } from '../ui/theme.js';

const DEFAULT_VIEWPORT = 12;
const LABEL_WIDTH = 22;

type Props = {
  current: string;
  onSelect: (id: string) => void;
  onCancel: () => void;
  providerKeys?: Set<string>;
  activeProvider?: string;
};

type Row =
  | { kind: 'header'; providerId: string; label: string; count: number; expanded: boolean }
  | { kind: 'model'; model: ModelEntry; providerId: string };

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)) + '\u2026';
}

function availableProviders(keys: Set<string>, active?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of PROVIDERS) {
    const include = keys.has(p.id) || p.id === active;
    if (include && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p.id);
    }
  }
  return out;
}

function buildBrowseRows(
  visibleProviders: string[],
  expandedProvider: string | null,
): Row[] {
  const rows: Row[] = [];
  for (const pid of visibleProviders) {
    const models = MODELS.filter((m) => m.provider === pid);
    if (models.length === 0) continue;
    const label = providerFor(pid).label;
    const expanded = pid === expandedProvider;
    rows.push({ kind: 'header', providerId: pid, label, count: models.length, expanded });
    if (expanded) {
      for (const m of models) rows.push({ kind: 'model', model: m, providerId: pid });
    }
  }
  return rows;
}

function buildSearchRows(
  visibleProviders: string[],
  query: string,
): Row[] {
  const q = query.toLowerCase().trim();
  const allowed = new Set(visibleProviders);
  return MODELS.filter((m) => allowed.has(m.provider))
    .filter((m) => {
      if (!q) return true;
      return (
        m.label.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
      );
    })
    .map((m) => ({ kind: 'model' as const, model: m, providerId: m.provider }));
}

function firstSelectableIndex(rows: Row[], preferProvider?: string): number {
  if (preferProvider) {
    const i = rows.findIndex((r) => r.kind === 'model' && r.providerId === preferProvider);
    if (i >= 0) return i;
  }
  const any = rows.findIndex((r) => r.kind === 'model');
  return any >= 0 ? any : 0;
}

function findRowIndexForModelId(rows: Row[], id: string): number {
  return rows.findIndex((r) => r.kind === 'model' && r.model.id === id);
}

export function ModelSelector({ current, onSelect, onCancel, providerKeys, activeProvider }: Props) {
  const t = getTheme();
  const keys = providerKeys ?? new Set<string>();

  const visibleProviders = useMemo(
    () => availableProviders(keys, activeProvider),
    [keys, activeProvider],
  );

  // Resolve the provider of the currently-selected model so we expand the
  // right group on first render.
  const currentProvider = useMemo(() => {
    const hit = MODELS.find((m) => m.id === current);
    if (hit && visibleProviders.includes(hit.provider)) return hit.provider;
    return visibleProviders[0] ?? null;
  }, [current, visibleProviders]);

  const [expandedProvider, setExpandedProvider] = useState<string | null>(currentProvider);
  const [query, setQuery] = useState('');
  const searching = query.length > 0;

  const rows = useMemo<Row[]>(() => {
    return searching
      ? buildSearchRows(visibleProviders, query)
      : buildBrowseRows(visibleProviders, expandedProvider);
  }, [searching, query, visibleProviders, expandedProvider]);

  // Initial cursor position: row of the currently-selected model if it's
  // visible; else first model row.
  const [cursor, setCursor] = useState<number>(() => {
    const initRows = buildBrowseRows(visibleProviders, currentProvider);
    const i = findRowIndexForModelId(initRows, current);
    return i >= 0 ? i : firstSelectableIndex(initRows, currentProvider ?? undefined);
  });

  // Clamp cursor whenever the row set changes (search query edits, group
  // collapse/expand, etc.). Snap to nearest selectable row.
  React.useEffect(() => {
    if (rows.length === 0) {
      setCursor(0);
      return;
    }
    const clamped = Math.min(cursor, rows.length - 1);
    if (rows[clamped]?.kind !== 'model') {
      // Find nearest model row (searching forward then backward).
      let forward = clamped + 1;
      while (forward < rows.length && rows[forward]!.kind !== 'model') forward++;
      if (forward < rows.length) { setCursor(forward); return; }
      let back = clamped - 1;
      while (back >= 0 && rows[back]!.kind !== 'model') back--;
      if (back >= 0) { setCursor(back); return; }
      setCursor(clamped);
    } else if (clamped !== cursor) {
      setCursor(clamped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function moveCursor(delta: 1 | -1): void {
    if (rows.length === 0) return;
    let next = cursor;
    for (let steps = 0; steps < rows.length; steps++) {
      next = (next + delta + rows.length) % rows.length;
      if (rows[next]?.kind === 'model' || rows[next]?.kind === 'header') break;
    }
    setCursor(next);
  }

  function expandCurrent(): void {
    const row = rows[cursor];
    if (!row) return;
    if (row.kind === 'header') {
      setExpandedProvider(row.providerId);
      return;
    }
    // Model rows don't react to Right.
  }

  function collapseCurrent(): void {
    const row = rows[cursor];
    if (!row) return;
    if (row.kind === 'model') {
      // Jump cursor to the provider header and collapse.
      setExpandedProvider(null);
      // Recompute rows with nothing expanded to position the cursor on the
      // provider header in the next render.
      const collapsedRows = buildBrowseRows(visibleProviders, null);
      const headerIdx = collapsedRows.findIndex(
        (r) => r.kind === 'header' && r.providerId === row.providerId,
      );
      if (headerIdx >= 0) setCursor(headerIdx);
      return;
    }
    if (row.kind === 'header' && row.expanded) {
      setExpandedProvider(null);
    }
  }

  function chooseCurrent(): void {
    const row = rows[cursor];
    if (!row) return;
    if (row.kind === 'header') {
      setExpandedProvider(row.providerId);
      // Move cursor to the first model of that provider in the new rows.
      const newRows = buildBrowseRows(visibleProviders, row.providerId);
      const firstModelIdx = newRows.findIndex(
        (r) => r.kind === 'model' && r.providerId === row.providerId,
      );
      if (firstModelIdx >= 0) setCursor(firstModelIdx);
      return;
    }
    onSelect(row.model.id);
  }

  useInput((input, key) => {
    if (rows.length === 0 && visibleProviders.length === 0) {
      if (key.escape || key.return) onCancel();
      return;
    }

    if (key.escape) {
      if (searching) setQuery('');
      else onCancel();
      return;
    }
    if (key.backspace || key.delete) {
      if (query.length > 0) setQuery(query.slice(0, -1));
      return;
    }
    if (key.upArrow) { moveCursor(-1); return; }
    if (key.downArrow) { moveCursor(1); return; }
    if (key.leftArrow && !searching) { collapseCurrent(); return; }
    if (key.rightArrow && !searching) { expandCurrent(); return; }
    if (key.return) { chooseCurrent(); return; }

    // Typing starts / extends search. Only printable ASCII subset; ignore
    // control keys and escape-sequence artifacts.
    if (input && !key.ctrl && !key.meta) {
      for (const cp of input) {
        const code = cp.codePointAt(0) ?? 0;
        if (code < 0x20 || code === 0x7f) continue;
        setQuery((q) => q + cp);
      }
    }
  });

  // Viewport: show at most VIEWPORT rows with the cursor centered when
  // possible. Fall back to a smaller viewport on short terminals.
  const termRows = process.stdout.rows ?? 24;
  const viewport = Math.max(5, Math.min(DEFAULT_VIEWPORT, termRows - 8));
  const start = Math.max(
    0,
    Math.min(rows.length - viewport, cursor - Math.floor(viewport / 2)),
  );
  const visible = rows.slice(start, start + viewport);
  const hiddenAbove = start;
  const hiddenBelow = Math.max(0, rows.length - (start + visible.length));

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={t.accent} bold>-- select model --</Text>
      </Box>
      <Text color={t.muted}>
        {searching
          ? 'type to filter · backspace to edit · esc to clear search'
          : 'up/dn move · enter apply · ←/→ collapse/expand · type to search · esc cancel'}
      </Text>

      {searching && (
        <Box marginTop={1}>
          <Text color={t.muted}>search: </Text>
          <Text color={t.accent}>{query}</Text>
          <Text color={t.muted}> ({rows.length} match{rows.length === 1 ? '' : 'es'})</Text>
        </Box>
      )}

      {visibleProviders.length === 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={t.warn}>no signed-in providers</Text>
          <Text color={t.muted}>run: forge login  (or: forge login --provider &lt;id&gt;)</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {hiddenAbove > 0 && (
            <Text color={t.muted}>   +{hiddenAbove} above</Text>
          )}
          {rows.length === 0 && searching && (
            <Text color={t.muted}>   (no models match "{query}")</Text>
          )}
          {visible.map((row, i) => {
            const absIdx = start + i;
            const focused = absIdx === cursor;
            if (row.kind === 'header') {
              const hasKey = keys.has(row.providerId);
              return (
                <Box key={`h:${row.providerId}`}>
                  <Text color={focused ? t.accent : t.muted}>
                    {focused ? '> ' : '  '}
                  </Text>
                  <Text color={focused ? t.accent : t.info} bold>
                    {row.expanded ? '▾ ' : '▸ '}
                    {row.label}
                  </Text>
                  <Text color={t.muted}>  ({row.count} model{row.count === 1 ? '' : 's'})</Text>
                  {!hasKey && (
                    <Text color={t.warn}>  (active, no key)</Text>
                  )}
                </Box>
              );
            }
            const model = row.model;
            const active = model.id === current;
            const label = truncate(model.label, LABEL_WIDTH).padEnd(LABEL_WIDTH);
            const activeMark = active ? (
              <Text color={t.success}>●</Text>
            ) : (
              <Text color={t.muted}>·</Text>
            );
            return (
              <Box key={`m:${model.provider}:${model.id}`}>
                <Text color={focused ? t.accent : t.muted}>
                  {focused ? '> ' : '  '}
                </Text>
                {searching ? null : <Text color={t.muted}>  </Text>}
                {activeMark}
                <Text> </Text>
                <Text color={focused ? t.accent : t.text} bold={focused}>
                  {label}
                </Text>
                <Text color={t.muted}>{truncate(model.id, 44)}</Text>
                {searching && (
                  <Text color={t.muted}>  [{providerFor(model.provider).label}]</Text>
                )}
              </Box>
            );
          })}
          {hiddenBelow > 0 && (
            <Text color={t.muted}>   +{hiddenBelow} below</Text>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={t.muted}>current: </Text>
        <Text color={t.accent}>{labelFor(current)}</Text>
        <Text color={t.muted}>  </Text>
        <Text color={t.muted}>{MODELS.find((m) => m.id === current)?.provider ?? ''}</Text>
      </Box>
    </Box>
  );
}
