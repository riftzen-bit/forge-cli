// Panel listing currently-executing tool calls. One spinner frame is shown
// on the most recent tool; older rows get a muted dot. In compact mode we
// cap the visible rows so the panel height stays stable during streaming.

import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../../ui/theme.js';
import { displayName, prettyArgs } from '../toolFormat.js';
import { useTick, SPINNER_FRAMES } from './useTick.js';
import type { ActiveTool } from './types.js';

// Compact mode shows the N most recent tools; the rest are summarised as
// "+N tool uses". Keeps height bounded when many tools run in parallel.
const COMPACT_VISIBLE = 3;

type RowProps = {
  tool: ActiveTool;
  elapsed: string;
  spinnerFrame: string;
  cwd: string;
  showSpinner: boolean;
};

function ActiveToolRow({ tool, elapsed, spinnerFrame, cwd, showSpinner }: RowProps) {
  const t = getTheme();
  const name = displayName(tool.name);
  const args = prettyArgs(tool.name, tool.input, cwd);
  const prefix = tool.tag ? `[${tool.tag}] ` : '';
  return (
    <Box>
      <Text wrap="truncate-end">
        {showSpinner ? (
          <Text color={t.warn}>{spinnerFrame}</Text>
        ) : (
          <Text color={t.muted}>·</Text>
        )}
        <Text> </Text>
        <Text color={t.muted}>{prefix}</Text>
        <Text color={t.toolTag} bold>{name}</Text>
        <Text color={t.text}>({args})</Text>
        <Text color={t.muted}>  {elapsed}s</Text>
      </Text>
    </Box>
  );
}

type Props = {
  tools: ActiveTool[];
  cwd: string;
  verbose: boolean;
};

export function ActiveToolsPanel({ tools, cwd, verbose }: Props) {
  const t = getTheme();
  const { frame, now } = useTick(160);
  const spinner = SPINNER_FRAMES[frame] ?? '';

  if (verbose) {
    return (
      <Box flexDirection="column">
        {tools.map((tool, i) => (
          <ActiveToolRow
            key={tool.id}
            tool={tool}
            elapsed={((now - tool.startedAt) / 1000).toFixed(1)}
            spinnerFrame={spinner}
            cwd={cwd}
            showSpinner={i === 0}
          />
        ))}
      </Box>
    );
  }

  const visible = tools.slice(-COMPACT_VISIBLE);
  const hidden = tools.length - visible.length;
  return (
    <Box flexDirection="column">
      {visible.map((tool, i) => (
        <ActiveToolRow
          key={tool.id}
          tool={tool}
          elapsed={((now - tool.startedAt) / 1000).toFixed(1)}
          spinnerFrame={spinner}
          cwd={cwd}
          showSpinner={i === 0}
        />
      ))}
      {hidden > 0 && (
        <Box>
          <Text color={t.muted}>  ... +{hidden} tool use{hidden === 1 ? '' : 's'} (ctrl+o to expand)</Text>
        </Box>
      )}
    </Box>
  );
}
