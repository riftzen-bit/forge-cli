import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { listSessions, formatTimestamp, truncate, type SessionSummary } from '../session/store.js';
import { getTheme } from '../ui/theme.js';

type Props = {
  onSelect: (session: SessionSummary) => void;
  onCancel: () => void;
};

export function ResumeSelector({ onSelect, onCancel }: Props) {
  const t = getTheme();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    void (async () => {
      const list = await listSessions(20);
      setSessions(list);
    })();
  }, []);

  useInput((_, key) => {
    if (!sessions || sessions.length === 0) {
      if (key.escape || key.return) onCancel();
      return;
    }
    if (key.upArrow)   setIdx((i) => (i - 1 + sessions.length) % sessions.length);
    if (key.downArrow) setIdx((i) => (i + 1) % sessions.length);
    if (key.return)    onSelect(sessions[idx]!);
    if (key.escape)    onCancel();
  });

  return (
    <Box flexDirection="column">
      <Text color={t.accent} bold>-- resume session --</Text>
      <Text color={t.muted}>pick a past chat to continue</Text>

      {sessions === null ? (
        <Box marginTop={1}>
          <Text color={t.muted}>loading sessions...</Text>
        </Box>
      ) : sessions.length === 0 ? (
        <Box marginTop={1}>
          <Text color={t.muted}>no past sessions found in ~/.claude/projects/</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {sessions.map((s, i) => {
            const focused = i === idx;
            return (
              <Box key={s.id}>
                <Text color={focused ? t.accent : t.muted}>
                  {focused ? '> ' : '  '}
                </Text>
                <Text color={focused ? t.accent : t.text} bold={focused}>
                  {formatTimestamp(s.mtime).padEnd(10)}
                </Text>
                <Text color={t.muted}>{s.id.slice(0, 8)}  </Text>
                <Text color={t.text}>{truncate(s.preview, 60)}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={t.muted}>up/dn move, enter resume, esc cancel</Text>
      </Box>
    </Box>
  );
}
