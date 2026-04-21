import type { PermissionRule } from '../config/settings.js';

export type RuleDecision = { decision: 'allow' | 'deny'; rule: PermissionRule } | null;

export function matchRule(
  rules: PermissionRule[],
  tool: string,
  input: Record<string, unknown>,
): RuleDecision {
  for (const rule of rules) {
    if (rule.tool !== tool && rule.tool !== '*') continue;
    if (!rule.match) return { decision: rule.decision, rule };
    const hay = targetString(tool, input);
    try {
      const re = new RegExp(rule.match);
      if (re.test(hay)) return { decision: rule.decision, rule };
    } catch {
      if (hay.includes(rule.match)) return { decision: rule.decision, rule };
    }
  }
  return null;
}

function targetString(tool: string, input: Record<string, unknown>): string {
  for (const k of ['file_path', 'path', 'notebook_path', 'command', 'pattern', 'query', 'url']) {
    const v = input[k];
    if (typeof v === 'string') return v;
  }
  return JSON.stringify(input);
}
