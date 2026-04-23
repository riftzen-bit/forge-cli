import React from 'react';
import { Box, Text } from 'ink';
import { labelFor } from '../agent/models.js';
import type { Effort } from '../agent/effort.js';
import type { AuthStatus } from '../auth/status.js';
import { authBadge } from '../auth/status.js';
import { getTheme } from '../ui/theme.js';

type Props = {
  model: string;
  effort: Effort;
  auth: AuthStatus;
  cwd: string;
  planMode?: boolean;
  tokens?: number;
  tokenLimit?: number;
  template?: string;
};

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

export function StatusBar({ model, effort, auth, cwd, planMode, tokens, tokenLimit, template }: Props) {
  const t = getTheme();
  const badge = authBadge(auth);
  const cwdShort = shortCwd(cwd);
  const pct = typeof tokens === 'number' && tokenLimit ? Math.round((tokens / tokenLimit) * 100) : undefined;
  const ctxColor = pct === undefined ? t.muted : pct >= 90 ? t.error : pct >= 80 ? t.warn : t.muted;

  if (template) {
    const rendered = renderTemplate(template, {
      model: labelFor(model),
      effort,
      auth: badge.label,
      cwd: cwdShort,
      plan: planMode ? 'plan' : '',
      ctx: pct !== undefined ? `${pct}%` : '',
      tokens: tokens !== undefined ? String(tokens) : '',
    });
    return (
      <Box>
        <Text color={t.muted} wrap="truncate-end">{rendered}</Text>
      </Box>
    );
  }

  const modeLabel = planMode ? '-- PLAN --' : '-- READY --';
  const modeColor = planMode ? t.planMode : t.accent;
  const bar = tokens !== undefined && tokenLimit ? bucket(tokens, tokenLimit) : undefined;
  const tokStr = tokens !== undefined ? formatTokens(tokens) : undefined;

  return (
    <Box>
      <Text wrap="truncate-end">
        <Text color={modeColor} bold>{modeLabel}</Text>
        <Text color={t.muted}>  </Text>
        <Text color={t.accent}>{labelFor(model)}</Text>
        <Text color={t.muted}>  </Text>
        <Text color={t.info}>{effort}</Text>
        <Text color={t.muted}>  </Text>
        {bar && (
          <>
            <Text color={ctxColor}>[{bar}]</Text>
            <Text color={ctxColor}> {pct}%</Text>
            {tokStr && <Text color={t.muted}> {tokStr}</Text>}
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
