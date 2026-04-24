import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { labelFor, contextWindowFor } from '../agent/models.js';
import type { Effort } from '../agent/effort.js';
import type { AuthStatus } from '../auth/status.js';
import { authBadge } from '../auth/status.js';
import { getTheme } from '../ui/theme.js';
import { providerFor } from '../agent/providers.js';
import type { PermissionMode } from '../config/settings.js';

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

function modeBadge(mode: PermissionMode | undefined): { label: string; colorKey: 'accent' | 'modePlan' | 'modeYolo' | 'modeAutoAccept' } {
  if (mode === 'plan')       return { label: '-- PLAN --',        colorKey: 'modePlan' };
  if (mode === 'yolo')       return { label: '-- YOLO --',        colorKey: 'modeYolo' };
  if (mode === 'autoAccept') return { label: '-- AUTO-ACCEPT --', colorKey: 'modeAutoAccept' };
  return { label: '-- READY --', colorKey: 'accent' };
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

function bucket(total: number, limit: number, width = 10): string {
  const pct = Math.min(1, total / limit);
  const filled = Math.round(pct * width);
  return '#'.repeat(filled) + '.'.repeat(width - filled);
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

  const modeLabel = badge_.label;
  const modeColor = t[badge_.colorKey];
  const bar = tokens !== undefined && limit ? bucket(tokens, limit) : undefined;

  return (
    <Box>
      <Text wrap="truncate-end">
        <Text color={modeColor} bold>{modeLabel}</Text>
        <Text color={t.muted}>  </Text>
        <Text color={t.accent}>{labelFor(model)}</Text>
        {providerLabel && <Text color={t.muted}>@</Text>}
        {providerLabel && <Text color={t.info}>{providerLabel}</Text>}
        <Text color={t.muted}>  </Text>
        <Text color={t.info}>{effort}</Text>
        <Text color={t.muted}>  </Text>
        {bar && (
          <>
            <Text color={ctxColor}>[{bar}]</Text>
            <Text color={ctxColor}> {ctxLabel}</Text>
            {pct !== undefined && <Text color={t.muted}> ({pct}%)</Text>}
            <Text color={t.muted}>  </Text>
          </>
        )}
        <Text color={badge.color === 'green' ? t.success : t.error}>{badge.label}</Text>
        <Text color={t.muted}>  </Text>
        <Text color={t.muted}>{cwdShort}</Text>
      </Text>
    </Box>
  );
}
