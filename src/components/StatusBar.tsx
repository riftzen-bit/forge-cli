import React from 'react';
import { Box, Text } from 'ink';
import { labelFor } from '../agent/models.js';
import type { Effort } from '../agent/effort.js';
import type { AuthStatus } from '../auth/status.js';
import { authBadge } from '../auth/status.js';

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
  const badge = authBadge(auth);
  const shortCwd = cwd.length > 40 ? '…' + cwd.slice(-39) : cwd;
  const pct = typeof tokens === 'number' && tokenLimit ? Math.round((tokens / tokenLimit) * 100) : undefined;
  const tokColor: 'gray' | 'yellow' | 'red' =
    pct === undefined ? 'gray' : pct >= 90 ? 'red' : pct >= 80 ? 'yellow' : 'gray';

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
        <Text dimColor>{rendered}</Text>
      </Box>
    );
  }

  return (
    <Box paddingX={2}>
      <Text color="cyan">◆ </Text>
      <Text color="cyan" bold>{labelFor(model)}</Text>
      <Text dimColor>  ·  </Text>
      <Text color="magenta">{effort}</Text>
      <Text dimColor>  ·  </Text>
      <Text color={badge.color}>●</Text>
      <Text dimColor> {badge.label}  ·  </Text>
      <Text dimColor>{shortCwd}</Text>
      {planMode && (
        <>
          <Text dimColor>  ·  </Text>
          <Text color="yellow" bold>plan</Text>
        </>
      )}
      {pct !== undefined && (
        <>
          <Text dimColor>  ·  </Text>
          <Text color={tokColor}>ctx {pct}%</Text>
        </>
      )}
    </Box>
  );
}
