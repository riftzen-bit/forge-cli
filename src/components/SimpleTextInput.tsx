import React, { useEffect, useRef, useState } from 'react';
import { Text, useInput } from 'ink';
import chalk from 'chalk';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  placeholder?: string;
  focus?: boolean;
  mask?: string;
};

export function SimpleTextInput({
  value: extVal,
  onChange,
  onSubmit,
  placeholder = '',
  focus = true,
  mask,
}: Props) {
  const valueRef = useRef(extVal);
  const cursorRef = useRef(extVal.length);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (extVal !== valueRef.current) {
      valueRef.current = extVal;
      cursorRef.current = extVal.length;
      forceRender((n) => n + 1);
    }
  }, [extVal]);

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.(valueRef.current);
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
        v = v.slice(0, c) + input + v.slice(c);
        c = c + input.length;
        changed = true;
      }

      valueRef.current = v;
      cursorRef.current = c;
      forceRender((n) => n + 1);
      if (changed) onChange(v);
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
