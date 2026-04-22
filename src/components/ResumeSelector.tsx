import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { listSessions, formatTimestamp, truncate, type SessionSummary } from '../session/store.js';

type Props = {
  onSelect: (session: SessionSummary) => void;
  onCancel: () => void;
};

export function ResumeSelector({ onSelect, onCancel }: Props) {
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
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
      >
        <Box>
          <Text color="cyan" bold>* </Text>
          <Text bold>Resume Session</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>pick a past chat to continue · Enter resumes it here</Text>
        </Box>

        {sessions === null ? (
          <Box marginTop={1}>
            <Text dimColor>loading sessions...</Text>
          </Box>
        ) : sessions.length === 0 ? (
          <Box marginTop={1}>
            <Text dimColor>no past sessions found in ~/.claude/projects/</Text>
          </Box>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            {sessions.map((s, i) => {
              const focused = i === idx;
              return (
                <Box key={s.id} flexDirection="column">
                  <Box>
                    <Text color={focused ? 'cyan' : 'white'} bold={focused}>
                      {focused ? '> ' : '  '}
                      {formatTimestamp(s.mtime).padEnd(10)}
                    </Text>
                    <Text dimColor>{s.id.slice(0, 8)}  </Text>
                    <Text>{truncate(s.preview, 60)}</Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>up/dn navigate · Enter resume · Esc cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
