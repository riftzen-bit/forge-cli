// Renders the AgentClient's pending image/file attachments above the input.
// Re-reads through the `tick` prop — the parent bumps the counter when an
// attachment is added, removed, or cleared, since attachments live on the
// frozen client outside React state.

import React from 'react';
import { Box, Text } from 'ink';
import type { AgentClient } from '../../agent/client.js';
import { getTheme } from '../../ui/theme.js';

type Props = { client: AgentClient; tick: number };

export function AttachmentsPanel({ client, tick }: Props) {
  void tick; // re-render trigger only
  const t = getTheme();
  const items = client.getAttachments();
  if (items.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={t.warn} bold>{'+ '}</Text>
        <Text color={t.warn} bold>attachments ({items.length})</Text>
        <Text color={t.muted}>  ctrl+x clear · sends with next message</Text>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderLeft
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        borderColor={t.warn}
        paddingLeft={1}
      >
        {items.map((a, i) => (
          <Box key={i}>
            <Text color={t.warn}>{i + 1}. </Text>
            <Text color={t.muted}>[{a.kind}] </Text>
            <Text color={t.text} wrap="truncate-end">{a.path}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
