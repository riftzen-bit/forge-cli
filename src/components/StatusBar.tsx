import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { labelFor, contextWindowFor } from '../agent/models.js';
import type { Effort } from '../agent/effort.js';
import type { AuthStatus } from '../auth/status.js';
import { authBadge } from '../auth/status.js';
import { getTheme } from '../ui/theme.js';
import { providerFor } from '../agent/providers.js';
import type { PermissionMode } from '../config/settings.js';
import { G, BLOCK_FILL } from '../ui/glyphs.js';

type Props = {
  model: string;
  effort: Effort;
  auth: AuthStatus;
  cwd: string;
  provider?: string;
  permissionMode?: PermissionMode;
  tokens?: number;
  tokenLimit?: number;
  template?: string;
};

function modeBadge(mode: PermissionMode | undefined): { icon: string; label: string; colorKey: 'accent' | 'modePlan' | 'modeYolo' | 'modeAutoAccept' } {
  if (mode === 'plan')       return { icon: G.diamondHollow, label: 'plan',     colorKey: 'modePlan' };
  if (mode === 'yolo')       return { icon: G.hexagon,       label: 'yolo',     colorKey: 'modeYolo' };
  if (mode === 'autoAccept') return { icon: G.squareDotted,  label: 'auto',     colorKey: 'modeAutoAccept' };
  return { icon: G.star, label: 'ready', colorKey: 'accent' };
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');
}

function shortCwd(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  let s = cwd.replace(/\\/g, '/');
  if (home) {
    const h = home.replace(/\\/g, '/');
    if (s.toLowerCase().startsWith(h.toLowerCase())) s = '~' + s.slice(h.length);
  }
  return s.length > 40 ? '...' + s.slice(-39) : s;
}

// Eight-step block fill ladder gives a smoother bar than '#'/'.' at the
// same column count. Each cell can render any of nine fill levels via
// the BLOCK_FILL ladder (0–8 eighths), so a 10-cell bar resolves 80
// distinct positions instead of 11. Empty cells render as `░` (light
// shade) instead of a literal space so the bar is still visible at 0%
// — a row of leading spaces reads as broken padding, not a status bar.
const EMPTY_CELL = '░';
function bucket(total: number, limit: number, width = 10): string {
  const pct = Math.max(0, Math.min(1, total / limit));
  const totalEighths = Math.round(pct * width * 8);
  const fullCells = Math.floor(totalEighths / 8);
  const partial = totalEighths % 8;
  const cells: string[] = [];
  for (let i = 0; i < width; i++) {
    if (i < fullCells) cells.push(BLOCK_FILL[8]!);
    else if (i === fullCells && partial > 0) cells.push(BLOCK_FILL[partial]!);
    else cells.push(EMPTY_CELL);
  }
  return cells.join('');
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(2) + 'k';
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k';
  return (n / 1_000_000).toFixed(2) + 'M';
}

export const StatusBar = memo(_StatusBar);

function _StatusBar({ model, effort, auth, cwd, provider, permissionMode, tokens, tokenLimit, template }: Props) {
  const t = getTheme();
  const badge = authBadge(auth);
  const cwdShort = shortCwd(cwd);
  const limit = tokenLimit ?? contextWindowFor(model);
  const pct = typeof tokens === 'number' && limit
    ? Math.max(0, Math.min(100, Math.round((tokens / limit) * 100)))
    : undefined;
  const ctxColor = pct === undefined ? t.muted : pct >= 90 ? t.error : pct >= 80 ? t.warn : t.muted;
  const providerLabel = provider ? providerFor(provider).label : '';
  const ctxLabel = typeof tokens === 'number' && limit
    ? `${formatTokens(tokens)}/${formatTokens(limit)}`
    : '';
  const badge_ = modeBadge(permissionMode);

  if (template) {
    const rendered = renderTemplate(template, {
      model: labelFor(model),
      effort,
      auth: badge.label,
      cwd: cwdShort,
      provider: providerLabel,
      mode: permissionMode ?? 'default',
      plan: permissionMode === 'plan' ? 'plan' : '',
      yolo: permissionMode === 'yolo' ? 'yolo' : '',
      autoaccept: permissionMode === 'autoAccept' ? 'auto' : '',
      ctx: ctxLabel,
      ctxPct: pct !== undefined ? `${pct}%` : '',
      tokens: tokens !== undefined ? String(tokens) : '',
      limit: String(limit),
    });
    return (
      <Box>
        <Text color={t.muted} wrap="truncate-end">{rendered}</Text>
      </Box>
    );
  }

  const modeColor = t[badge_.colorKey];
  // 6 cells at wide mode is enough resolution for ctx pct without eating
  // half the line. Narrow mode skips the bar entirely so width doesn't
  // matter there.
  const bar = tokens !== undefined && limit ? bucket(tokens, limit, 6) : undefined;
  // Tighter than `  ·  ` — the status bar reads as a single chip strip,
  // not five separate sentences. One space + bullet + one space.
  const sep = ` ${G.bullet} `;
  const cols = process.stdout.columns ?? 100;

  // Narrow-terminal layout: at < 60 cols there is no room for cwd, provider
  // tag, or the bar. Drop them and switch the ctx readout to a percentage.
  // At < 80 cols, drop only the cwd + provider tag — the bar still fits.
  // ≥ 80 cols renders the full status as before.
  if (cols < 60) {
    return (
      <Box>
        <Text wrap="truncate-end">
          <Text color={t.inverse} backgroundColor={modeColor} bold>{` ${badge_.icon} ${badge_.label.toUpperCase()} `}</Text>
          <Text color={t.borderIdle}>{sep}</Text>
          <Text color={t.accent} bold>{labelFor(model)}</Text>
          {pct !== undefined && (
            <>
              <Text color={t.borderIdle}>{sep}</Text>
              <Text color={ctxColor}>{pct}%</Text>
            </>
          )}
          <Text color={t.borderIdle}>{sep}</Text>
          <Text color={badge.color === 'green' ? t.success : t.error}>{badge.color === 'green' ? G.toolOk : G.toolErr}</Text>
        </Text>
      </Box>
    );
  }

  if (cols < 80) {
    return (
      <Box>
        <Text wrap="truncate-end">
          <Text color={t.inverse} backgroundColor={modeColor} bold>{` ${badge_.icon} ${badge_.label.toUpperCase()} `}</Text>
          <Text color={t.borderIdle}>{sep}</Text>
          <Text color={t.accent} bold>{labelFor(model)}</Text>
          <Text color={t.borderIdle}>{sep}</Text>
          <Text color={t.info}>{effort}</Text>
          {bar && (
            <>
              <Text color={t.borderIdle}>{sep}</Text>
              <Text color={ctxColor}>{bar}</Text>
              {pct !== undefined && <Text color={t.muted}> {pct}%</Text>}
            </>
          )}
          <Text color={t.borderIdle}>{sep}</Text>
          <Text color={badge.color === 'green' ? t.success : t.error}>{badge.color === 'green' ? G.toolOk : G.toolErr}</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text wrap="truncate-end">
        {/* Mode chip — bg-coloured rectangle with inverse fg.  Reads as a
            real status pill, not just colored text. */}
        <Text color={t.inverse} backgroundColor={modeColor} bold>{` ${badge_.icon} ${badge_.label.toUpperCase()} `}</Text>
        <Text color={t.borderIdle}>{sep}</Text>
        <Text color={t.accent} bold>{labelFor(model)}</Text>
        {providerLabel && <Text color={t.muted}>@{providerLabel}</Text>}
        <Text color={t.borderIdle}>{sep}</Text>
        <Text color={t.info}>{effort}</Text>
        {bar && (
          <>
            <Text color={t.borderIdle}>{sep}</Text>
            <Text color={ctxColor}>{bar}</Text>
            <Text color={ctxColor}> {ctxLabel}</Text>
          </>
        )}
        <Text color={t.borderIdle}>{sep}</Text>
        <Text color={badge.color === 'green' ? t.success : t.error}>{badge.color === 'green' ? G.toolOk : G.toolErr}</Text>
        <Text color={t.borderIdle}>{sep}</Text>
        <Text color={t.muted}>{cwdShort}</Text>
      </Text>
    </Box>
  );
}
