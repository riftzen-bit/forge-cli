// 3-choice permission prompt shown when AutoAccept mode wants to run a
// risky tool call. User picks Yes / Yes-Allow-Session / No.
//
//   Yes               — allow this one call; ask again next time
//   Yes (allow session) — allow + persist to <cwd>/.forge/permissions.json
//   No                — deny + interrupt the agent turn

import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { getTheme } from '../ui/theme.js';

export type PermissionChoice = 'yes' | 'yesSession' | 'no';

type Props = {
  tool: string;
  input: Record<string, unknown>;
  onPick: (choice: PermissionChoice) => void;
};

const CHOICES: ReadonlyArray<{ key: PermissionChoice; label: string; hint: string }> = [
  { key: 'yes',        label: 'Yes',                hint: 'allow this one call' },
  { key: 'yesSession', label: 'Yes, allow session', hint: 'save to project; never ask again for this tool/pattern' },
  { key: 'no',         label: 'No',                 hint: 'deny and stop this turn' },
];

// Render a one-line summary of the tool input so the user sees what they are
// approving without having to read a JSON dump.
function summarize(tool: string, input: Record<string, unknown>): string {
  if (tool === 'Bash') {
    const cmd = String(input['command'] ?? '');
    return cmd.length > 200 ? cmd.slice(0, 199) + '...' : cmd;
  }
  if (tool === 'Edit' || tool === 'Write' || tool === 'Read' || tool === 'NotebookEdit') {
    const path = String(input['file_path'] ?? input['path'] ?? '');
    return path;
  }
  if (tool === 'WebFetch') return String(input['url'] ?? '');
  if (tool === 'WebSearch') return String(input['query'] ?? '');
  // Fallback: compact JSON, truncated.
  const json = JSON.stringify(input);
  return json.length > 200 ? json.slice(0, 199) + '...' : json;
}

export function PermissionPrompt({ tool, input, onPick }: Props) {
  const t = getTheme();
  const [idx, setIdx] = useState(0);
  // Swallow stray Enter/Esc that arrive in the same tick the modal mounts:
  // user-submit keystrokes that triggered the underlying tool call can be
  // re-dispatched into the modal as `key.escape` (Windows terminals emit
  // "\n\x1b" for some Enter combinations) and instantly auto-deny the
  // permission. Same race the AskUserQuestion modal hits. Navigation keys
  // are still processed during the grace window — they're harmless.
  const mountedAtRef = useRef(Date.now());
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);
  const isInGrace = (): boolean => Date.now() - mountedAtRef.current < 250;

  useInput((_, key) => {
    if (key.upArrow)   setIdx((i) => (i - 1 + CHOICES.length) % CHOICES.length);
    if (key.downArrow) setIdx((i) => (i + 1) % CHOICES.length);
    if (key.return) {
      if (isInGrace()) return;
      onPick(CHOICES[idx]!.key);
      return;
    }
    if (key.escape) {
      if (isInGrace()) return;
      onPick('no');
    }
  });

  const summary = summarize(tool, input);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={t.warn} paddingX={1}>
      <Text color={t.warn} bold>permission needed</Text>
      <Box marginTop={1}>
        <Text color={t.text}>tool: </Text>
        <Text color={t.accent} bold>{tool}</Text>
      </Box>
      {summary && (
        <Box>
          <Text color={t.text}>arg:  </Text>
          <Text color={t.muted} wrap="truncate-end">{summary}</Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        {CHOICES.map((c, i) => {
          const focused = i === idx;
          return (
            <Box key={c.key}>
              <Text color={focused ? t.accent : t.muted}>{focused ? '> ' : '  '}</Text>
              <Text color={focused ? t.accent : t.text} bold={focused}>{c.label.padEnd(24)}</Text>
              <Text color={t.muted}>{c.hint}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={t.muted}>up/dn move, enter pick, esc = no</Text>
      </Box>
    </Box>
  );
}
