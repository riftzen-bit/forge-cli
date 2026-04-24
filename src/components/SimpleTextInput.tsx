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
  const [, forceRender] = useState(0);

  useEffect(() => {
    const normalized = extVal.normalize('NFC');
    if (normalized !== lastEmittedRef.current) {
      valueRef.current = normalized;
      cursorRef.current = normalized.length;
      lastEmittedRef.current = normalized;
      forceRender((n) => n + 1);
    }
  }, [extVal]);

  const emit = (v: string) => {
    lastEmittedRef.current = v;
    onChange(v);
  };

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.(valueRef.current);
        return;
      }
      if (key.upArrow && onHistoryUp) {
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
      if (key.downArrow && onHistoryDown) {
        const next = onHistoryDown();
        if (next !== null) {
          const n = next.normalize('NFC');
          valueRef.current = n;
          cursorRef.current = n.length;
          forceRender((x) => x + 1);
          emit(n);
        }
        return;
      }
      if (
        key.upArrow ||
        key.downArrow ||
        key.ctrl ||
        key.meta ||
        key.tab ||
        (key.shift && key.tab)
      ) {
        return;
      }

      let v = valueRef.current;
      let c = cursorRef.current;
      let changed = false;

      if (key.leftArrow) {
        c = Math.max(0, c - 1);
      } else if (key.rightArrow) {
        c = Math.min(v.length, c + 1);
      } else if (key.backspace || key.delete) {
        if (c > 0) {
          v = v.slice(0, c - 1) + v.slice(c);
          c = c - 1;
          changed = true;
        }
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
