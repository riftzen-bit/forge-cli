import React from 'react';
import { Box } from 'ink';
import { ThinkingLine } from './ThinkingLine.js';
import { ActiveToolsPanel } from './chat/ActiveToolsPanel.js';
import { SubagentPanel } from './chat/SubagentPanel.js';
import { StreamingPreview } from './chat/StreamingPreview.js';
import type { ActiveTool, SubPreview } from './chat/types.js';

type Props = {
  busy: boolean;
  busyStartedAt?: number;
  thinking?: string;
  streamingText?: string;
  activeTools: ActiveTool[];
  subs: SubPreview[];
  cwd: string;
  verbose: boolean;
};

// Single-source-of-truth wrapper for everything that animates while a
// turn is in progress. Keeps the render order consistent and lets
// ChatScreen toggle the entire dynamic region with one boolean.
export function LiveStatus({
  busy,
  busyStartedAt,
  thinking,
  streamingText,
  activeTools,
  subs,
  cwd,
  verbose,
}: Props) {
  if (!busy) return null;
  return (
    <Box flexDirection="column" gap={1}>
      <ThinkingLine text={thinking} verbose={verbose} startedAt={busyStartedAt} />
      {activeTools.length > 0 && (
        <ActiveToolsPanel tools={activeTools} cwd={cwd} verbose={verbose} />
      )}
      {subs.length > 0 && <SubagentPanel subs={subs} verbose={verbose} />}
      {streamingText && <StreamingPreview text={streamingText} verbose={verbose} />}
    </Box>
  );
}
