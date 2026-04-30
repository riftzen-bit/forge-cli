import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { labelFor, contextWindowFor } from '../agent/models.js';
import type { Effort } from '../agent/effort.js';
import type { Thinking } from '../agent/thinking.js';
import type { AuthStatus } from '../auth/status.js';
import { authBadge } from '../auth/status.js';
import { getTheme } from '../ui/theme.js';
import { providerFor } from '../agent/providers.js';
import type { PermissionMode } from '../config/settings.js';
import { G } from '../ui/glyphs.js';

type Props = {
  model: string;
  effort: Effort;
  thinking?: Thinking;
  auth: AuthStatus;
  cwd: string;
  provider?: string;
  permissionMode?: PermissionMode;
  tokens?: number;
  tokenLimit?: number;
  template?: string;
};

// Rail glyph in the leftmost cell — encodes the active permission mode in
// a single-cell color marker so the status bar still hints at the mode
// without re-printing the YOLO/plan label that already appears in the
// Composer frame and the Banner. This keeps the bar dense and avoids
// triple-displaying the same word.
function modeRail(mode: PermissionMode | undefined): {
  glyph: string;
  colorKey: 'accent' | 'modePlan' | 'modeYolo' | 'modeAutoAccept';
} {
  if (mode === 'plan')       return { glyph: G.diamondHollow, colorKey: 'modePlan' };
  if (mode === 'yolo')       return { glyph: G.hexagon,       colorKey: 'modeYolo' };
  if (mode === 'autoAccept') return { glyph: G.squareDotted,  colorKey: 'modeAutoAccept' };
  return { glyph: G.star, colorKey: 'accent' };
}

export function renderModelStatus(model: string, provider: string | undefined, columns: number): string {
  return columns >= 72 && provider ? `${model}@${provider}` : model;
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

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(2) + 'k';
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k';
  return (n / 1_000_000).toFixed(2) + 'M';
}

export const StatusBar = memo(_StatusBar);

function _StatusBar({ model, effort, thinking, auth, cwd, provider, permissionMode, tokens, tokenLimit, template }: Props) {
  const t = getTheme();
  const badge = authBadge(auth);
  const cwdShort = shortCwd(cwd);
  const limit = tokenLimit ?? contextWindowFor(model);
  const pct = typeof tokens === 'number' && limit
    ? Math.max(0, Math.min(100, Math.round((tokens / limit) * 100)))
    : undefined;
  const ctxColor = pct === undefined ? t.muted : pct >= 90 ? t.error : pct >= 80 ? t.warn : t.muted;
  const providerMeta = provider ? providerFor(provider) : undefined;
  const providerLabel = providerMeta?.label ?? '';
  const codexRuntime = providerMeta?.runtime === 'codex-cli';
  const ctxLabel = typeof tokens === 'number' && limit
    ? `${formatTokens(tokens)}/${formatTokens(limit)}`
    : '';
  const rail = modeRail(permissionMode);

  if (template) {
    const rendered = renderTemplate(template, {
      model: labelFor(model),
      effort,
      thinking: thinking ?? '',
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

  const modeColor = t[rail.colorKey];
  const cols = process.stdout.columns ?? 100;
  const sep = `  ${G.bullet}  `;
  const showProvider = cols >= 80;
  const showContext = cols >= 60;
  const showEffort = cols >= 70;
  const reasoningLabel = codexRuntime ? 'thinking' : 'effort';
  const reasoningValue = codexRuntime ? thinking : effort;
  const showCwd = cols >= 90;
  const modelText = renderModelStatus(labelFor(model), undefined, cols);
  const ctxText = pct !== undefined ? `${pct}%` : ctxLabel;
  const authOk = badge.color === 'green';

  // Layout (left → right):
  //   <mode-rail>  model  · effort  · ctx N%  · auth ok|missing  · provider  · cwd
  // The mode rail is a single colored glyph (no YOLO/plan word). The mode
  // word already lives inside the Composer frame and the Banner; printing
  // it again on the bar is visual repetition. Each metric uses a muted
  // "key" prefix so the bar reads as a sparse key/value table instead of
  // a comma-soup.
  return (
    <Box>
      <Text wrap="truncate-end">
        <Text color={modeColor} bold>{rail.glyph}</Text>
        <Text>  </Text>
        <Text color={t.muted}>model </Text>
        <Text color={t.text} bold>{modelText}</Text>
        {showEffort && reasoningValue && (
          <>
            <Text color={t.borderIdle}>{sep}</Text>
            <Text color={t.muted}>{reasoningLabel} </Text>
            <Text color={t.text}>{reasoningValue}</Text>
          </>
        )}
        {showContext && ctxText && (
          <>
            <Text color={t.borderIdle}>{sep}</Text>
            <Text color={t.muted}>ctx </Text>
            <Text color={ctxColor}>{ctxText}</Text>
          </>
        )}
        <Text color={t.borderIdle}>{sep}</Text>
        <Text color={t.muted}>auth </Text>
        <Text color={authOk ? t.success : t.error}>{authOk ? 'ok' : 'missing'}</Text>
        {showProvider && providerLabel && (
          <>
            <Text color={t.borderIdle}>{sep}</Text>
            <Text color={t.muted}>{providerLabel}</Text>
          </>
        )}
        {showCwd && (
          <>
            <Text color={t.borderIdle}>{sep}</Text>
            <Text color={t.muted}>{cwdShort}</Text>
          </>
        )}
      </Text>
    </Box>
  );
}
