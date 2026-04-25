// Panel listing currently-executing tool calls. The most recent tool gets
// the live spinner; older rows get a dim arrow glyph. In compact mode we
// cap visible rows so the panel height stays stable during streaming.

import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../../ui/theme.js';
import { displayName, prettyArgs } from '../toolFormat.js';
import { useTick, SPINNER_FRAMES } from './useTick.js';
import { G } from '../../ui/glyphs.js';
import type { ActiveTool } from './types.js';

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
          <Text color={t.muted}>{G.toolRun}</Text>
        )}
        <Text> </Text>
        {prefix && <Text color={t.accentDim}>{prefix}</Text>}
        <Text color={t.toolTag} bold>{name}</Text>
        {args && (
          <>
            <Text color={t.muted}>  </Text>
            <Text color={t.text}>{args}</Text>
          </>
        )}
        <Text color={t.muted}>  {G.bullet}  {elapsed}s</Text>
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
  const { frame, now } = useTick(120);
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
          <Text color={t.muted}>  {G.ellipsis} +{hidden} tool{hidden === 1 ? '' : 's'} (ctrl+o expand)</Text>
        </Box>
      )}
    </Box>
  );
}
