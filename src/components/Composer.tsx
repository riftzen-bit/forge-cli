import React from 'react';
import { Box, Text } from 'ink';
import { SimpleTextInput } from './SimpleTextInput.js';
import { Hint, type HintItem } from './ui/Hint.js';
import { CellMarker } from './ui/CellMarker.js';
import { G } from '../ui/glyphs.js';
import type { PermissionMode } from '../config/settings.js';

type Props = {
  input: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onHistoryUp: () => string | null;
  onHistoryDown: () => string | null;
  busy: boolean;
  permissionMode: PermissionMode;
  borderColor: string;
  queueLength: number;
  hasAttachments: boolean;
};

function modeChip(mode: PermissionMode): { label: string; show: boolean } {
  if (mode === 'plan')        return { label: 'plan',  show: true };
  if (mode === 'yolo')        return { label: 'YOLO',  show: true };
  if (mode === 'autoAccept')  return { label: 'auto',  show: true };
  return { label: '',         show: false };
}

// Composer = bordered prompt frame + dynamic hint row.
// The frame carries the active permission-mode color (prompt-color).
// The hint row is contextual: it shows different keys when busy vs idle vs
// when there's a queue/attachments.
export function Composer({
  input,
  onChange,
  onSubmit,
  onHistoryUp,
  onHistoryDown,
  busy,
  permissionMode,
  borderColor,
  queueLength,
  hasAttachments,
}: Props) {
  const chip = modeChip(permissionMode);

  // The right-side title chip lives "in" the top border by abusing
  // marginRight so it floats above the bordered box. Ink doesn't support
  // border titles natively, so we fake it with a header row and tight
  // marginBottom={-1} to overlap the top edge — works on every terminal
  // we've tested. If it ever breaks visually, fall back to a normal row
  // above the box.
  const placeholder = busy
    ? 'queue a follow-up — sends when ready'
    : 'what should forge build, fix, or explain?';

  const hints = buildHints({ busy, queueLength, hasAttachments });

  return (
    <Box flexDirection="column">
      {busy && (
        <Box marginBottom={0}>
          <CellMarker kind="user" meta="queueing — sends after current turn" />
        </Box>
      )}
      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
      >
        <Box flexShrink={0}>
          <Text color={borderColor}>{busy ? G.ellipsis : G.prompt} </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <SimpleTextInput
            value={input}
            onChange={onChange}
            onSubmit={onSubmit}
            onHistoryUp={onHistoryUp}
            onHistoryDown={onHistoryDown}
            placeholder={placeholder}
          />
        </Box>
        {chip.show && (
          // flexShrink={0} pins the chip to its natural width so a long
          // input can't squeeze "YOLO" into "YOL\nO". width is set
          // explicitly so layout stabilises before the inner Text measures.
          <Box marginLeft={1} flexShrink={0} width={chip.label.length}>
            <Text color={borderColor} bold wrap="truncate">{chip.label}</Text>
          </Box>
        )}
      </Box>
      <Box paddingX={1}>
        <Hint items={hints} inline />
      </Box>
    </Box>
  );
}

// Two-key max in the steady state. More hints is noise — the / command menu
// is one keystroke away, the rest live in the doctor / `/help` output.
function buildHints({
  busy,
  queueLength,
  hasAttachments,
}: {
  busy: boolean;
  queueLength: number;
  hasAttachments: boolean;
}): HintItem[] {
  const out: HintItem[] = [];
  if (busy) {
    out.push({ key: 'esc', label: 'cancel' });
    out.push({ key: 'enter', label: queueLength > 0 ? 'skip+queue' : 'queue' });
    return out;
  }
  out.push({ key: 'enter', label: 'send' });
  out.push({ key: '/', label: 'commands' });
  if (hasAttachments) out.push({ key: 'ctrl+x', label: 'clear attached' });
  if (queueLength > 0) out.push({ key: 'esc', label: `drop queue (${queueLength})` });
  return out;
}
