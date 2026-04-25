import React, { useEffect, useRef, useState } from 'react';
import { Text, useInput } from 'ink';
import chalk from 'chalk';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  onHistoryUp?: () => string | null;
  onHistoryDown?: () => string | null;
  placeholder?: string;
  focus?: boolean;
  mask?: string;
};

// Compute (row, col) for a flat cursor index against a multi-line buffer.
// Row 0 is the first \n-delimited line; col is the offset within that line.
export function rowColAt(text: string, cursor: number): { row: number; col: number } {
  let row = 0;
  let col = 0;
  for (let i = 0; i < cursor && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      row++;
      col = 0;
    } else {
      col++;
    }
  }
  return { row, col };
}

// Inverse of rowColAt: given (row, col), produce a flat cursor index. Clamps
// col to the target row's length so vertical movement onto a shorter line
// lands at end-of-line instead of past it.
export function indexAtRowCol(text: string, row: number, col: number): number {
  const lines = text.split('\n');
  if (row < 0) return 0;
  if (row >= lines.length) {
    // Past last line — clamp to end of buffer.
    return text.length;
  }
  let idx = 0;
  for (let r = 0; r < row; r++) {
    idx += (lines[r]?.length ?? 0) + 1;
  }
  const lineLen = lines[row]?.length ?? 0;
  return idx + Math.min(col, lineLen);
}

export function lineCount(text: string): number {
  if (!text) return 1;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

export function SimpleTextInput({
  value: extVal,
  onChange,
  onSubmit,
  onHistoryUp,
  onHistoryDown,
  placeholder = '',
  focus = true,
  mask,
}: Props) {
  const valueRef = useRef(extVal.normalize('NFC'));
  const cursorRef = useRef(valueRef.current.length);
  const lastEmittedRef = useRef(valueRef.current);
  // History navigation state. We snapshot the live draft when the user
  // first presses ↑ so they can ↓ back out and recover their typing
  // instead of being stranded on an old entry or an empty buffer.
  const historyActiveRef = useRef(false);
  const historyDraftRef = useRef('');
  const [, forceRender] = useState(0);

  useEffect(() => {
    const normalized = extVal.normalize('NFC');
    if (normalized !== lastEmittedRef.current) {
      valueRef.current = normalized;
      cursorRef.current = normalized.length;
      lastEmittedRef.current = normalized;
      historyActiveRef.current = false;
      historyDraftRef.current = '';
      forceRender((n) => n + 1);
    }
  }, [extVal]);

  const emit = (v: string) => {
    lastEmittedRef.current = v;
    onChange(v);
  };

  const exitHistory = () => {
    historyActiveRef.current = false;
    historyDraftRef.current = '';
  };

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.(valueRef.current);
        return;
      }

      // Up arrow: try multi-line cursor move first; fall through to history
      // only when the cursor is on the first row of the buffer.
      if (key.upArrow) {
        const { row, col } = rowColAt(valueRef.current, cursorRef.current);
        if (row > 0) {
          cursorRef.current = indexAtRowCol(valueRef.current, row - 1, col);
          forceRender((x) => x + 1);
          return;
        }
        if (!onHistoryUp) return;
        // Entering history nav from typed text: stash the draft so the user
        // can ↓ past the newest entry to recover their work.
        if (!historyActiveRef.current) {
          historyDraftRef.current = valueRef.current;
          historyActiveRef.current = true;
        }
        const next = onHistoryUp();
        if (next !== null) {
          const n = next.normalize('NFC');
          valueRef.current = n;
          cursorRef.current = n.length;
          forceRender((x) => x + 1);
          emit(n);
        }
        return;
      }

      if (key.downArrow) {
        const text = valueRef.current;
        const { row, col } = rowColAt(text, cursorRef.current);
        const last = lineCount(text) - 1;
        // Multi-line: still rows below cursor → move down.
        if (row < last) {
          cursorRef.current = indexAtRowCol(text, row + 1, col);
          forceRender((x) => x + 1);
          return;
        }
        // On the last row — only navigate history when we're already in
        // history mode. Pressing ↓ on a fresh draft does nothing (matches
        // bash/zsh: ↓ past the newest entry empties the buffer, but we'd
        // rather snap back to the live draft).
        if (!historyActiveRef.current || !onHistoryDown) return;
        const next = onHistoryDown();
        if (next === null || next === '') {
          // Past the newest history entry → restore the original draft.
          const draft = historyDraftRef.current;
          valueRef.current = draft;
          cursorRef.current = draft.length;
          exitHistory();
          forceRender((x) => x + 1);
          emit(draft);
          return;
        }
        const n = next.normalize('NFC');
        valueRef.current = n;
        cursorRef.current = n.length;
        forceRender((x) => x + 1);
        emit(n);
        return;
      }

      if (key.ctrl || key.meta || key.tab || (key.shift && key.tab)) {
        return;
      }

      let v = valueRef.current;
      let c = cursorRef.current;
      let changed = false;

      if (key.leftArrow) {
        c = Math.max(0, c - 1);
        if (historyActiveRef.current) exitHistory();
      } else if (key.rightArrow) {
        c = Math.min(v.length, c + 1);
        if (historyActiveRef.current) exitHistory();
      } else if (key.backspace || key.delete) {
        if (c > 0) {
          v = v.slice(0, c - 1) + v.slice(c);
          c = c - 1;
          changed = true;
        }
        if (historyActiveRef.current) exitHistory();
      } else if (input) {
        for (const cp of input) {
          const code = cp.codePointAt(0) ?? 0;
          if (code === 0x08 || code === 0x7f) {
            if (c > 0) {
              v = v.slice(0, c - 1) + v.slice(c);
              c -= 1;
              changed = true;
            }
          } else if (code === 0x0a || code === 0x0d || code === 0x09) {
            continue;
          } else if (code < 0x20) {
            continue;
          } else {
            v = v.slice(0, c) + cp + v.slice(c);
            c += cp.length;
            changed = true;
          }
        }
        if (changed) {
          // Normalise the pre-cursor prefix and the post-cursor suffix
          // independently, then concatenate. This keeps the cursor on the
          // same character boundary when NFC collapses combining sequences
          // — regardless of whether the collapse happens before or after
          // the cursor. Subtracting `(before.length - v.length)` from c is
          // only correct when the entire shrink is in the prefix, which
          // isn't guaranteed for arbitrary paste input.
          const prefix = v.slice(0, c).normalize('NFC');
          const suffix = v.slice(c).normalize('NFC');
          v = prefix + suffix;
          c = prefix.length;
        }
        if (historyActiveRef.current) exitHistory();
      }

      valueRef.current = v;
      cursorRef.current = c;
      forceRender((n) => n + 1);
      if (changed) emit(v);
    },
    { isActive: focus },
  );

  const value = valueRef.current;
  const cursor = cursorRef.current;
  const display = mask ? mask.repeat(value.length) : value;

  if (!value) {
    if (!placeholder) {
      return focus ? <Text>{chalk.inverse(' ')}</Text> : <Text> </Text>;
    }
    if (!focus) return <Text>{chalk.grey(placeholder)}</Text>;
    return (
      <Text>
        {chalk.inverse(placeholder[0] ?? ' ')}
        {chalk.grey(placeholder.slice(1))}
      </Text>
    );
  }

  if (!focus) return <Text>{display}</Text>;

  const chars = Array.from(display);
  let rendered = '';
  let pos = 0;
  for (const ch of chars) {
    rendered += pos === cursor ? chalk.inverse(ch) : ch;
    pos += ch.length;
  }
  if (cursor >= value.length) rendered += chalk.inverse(' ');

  return <Text>{rendered}</Text>;
}
