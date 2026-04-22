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

export function StatusBar({ model, effort, auth, cwd, planMode, tokens, tokenLimit, template }: Props) {
  const t = getTheme();
  const badge = authBadge(auth);
  const shortCwd = cwd.length > 40 ? '...' + cwd.slice(-39) : cwd;
  const pct = typeof tokens === 'number' && tokenLimit ? Math.round((tokens / tokenLimit) * 100) : undefined;
  const ctxColor = pct === undefined ? t.subtle : pct >= 90 ? t.error : pct >= 80 ? t.warning : t.subtle;

  if (template) {
    const rendered = renderTemplate(template, {
      model: labelFor(model),
      effort,
      auth: badge.label,
      cwd: shortCwd,
      plan: planMode ? 'plan' : '',
      ctx: pct !== undefined ? `${pct}%` : '',
      tokens: tokens !== undefined ? String(tokens) : '',
    });
    return (
      <Box paddingX={2}>
        <Text color={t.subtle}>{rendered}</Text>
      </Box>
    );
  }

  const sep = <Text color={t.subtle}> · </Text>;

  return (
    <Box paddingX={2}>
      <Text color={t.claude} bold>{labelFor(model)}</Text>
      {sep}
      <Text color={t.permission}>{effort}</Text>
      {sep}
      <Text color={badge.color}>{badge.label}</Text>
      {sep}
      <Text color={t.subtle}>{shortCwd}</Text>
      {planMode && (
        <>
          {sep}
          <Text color={t.planMode} bold>plan</Text>
        </>
      )}
      {pct !== undefined && (
        <>
          {sep}
          <Text color={ctxColor}>ctx {pct}%</Text>
        </>
      )}
    </Box>
  );
}
