// Modal picker for the SDK's built-in AskUserQuestion tool. The agent
// passes an array of questions; we ask each one sequentially and return
// answers as a `{ [questionText]: answerString }` map. The SDK formats
// the result text on its own.
//
// Per question: arrow keys navigate, space toggles in multiSelect, enter
// submits, "Other" switches to a free-text input. Cancellation requires
// Esc twice within 1.5s (single Esc only arms cancel) — defends against
// stray `\x1b` bytes from split terminal escape sequences.

import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { SimpleTextInput } from './SimpleTextInput.js';
import { getTheme } from '../ui/theme.js';
import type { AskOption, AskQuestion, AskAnswer } from '../agent/askUser.js';

type Props = {
  questions: AskQuestion[];
  onAnswer: (a: AskAnswer) => void;
};

const OTHER_LABEL = 'Other';

type Item = AskOption & { isOther?: boolean };

function withOther(options: AskOption[]): Item[] {
  return [...options, { label: OTHER_LABEL, description: 'Type a custom answer.', isOther: true }];
}

function joinSelected(labels: string[], otherText?: string): string {
  const parts = [...labels];
  const trimmed = otherText?.trim();
  if (trimmed) parts.push(trimmed);
  return parts.join(', ');
}

export function AskQuestionPrompt({ questions, onAnswer }: Props) {
  const t = getTheme();
  const total = questions.length;

  const [qIdx, setQIdx] = useState(0);
  const answersRef = useRef<Record<string, string>>({});

  const current = questions[qIdx];
  const items: Item[] = current ? withOther(current.options) : [];
  const multiSelect = current?.multiSelect === true;

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<'choose' | 'other'>('choose');
  const [otherText, setOtherText] = useState('');
  const [escArmed, setEscArmed] = useState(false);

  const mountedAtRef = useRef(Date.now());
  const escTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  useEffect(() => {
    mountedAtRef.current = Date.now();
    return () => {
      if (escTimerRef.current) clearTimeout(escTimerRef.current);
    };
  }, []);
  const isInGrace = (): boolean => Date.now() - mountedAtRef.current < 750;

  function reset(): void {
    setIdx(0);
    setPicked(new Set());
    setPhase('choose');
    setOtherText('');
    setEscArmed(false);
    mountedAtRef.current = Date.now();
  }

  function commit(answerText: string): void {
    if (!current) return;
    answersRef.current[current.question] = answerText;
    if (qIdx + 1 >= total) {
      onAnswer({ answers: answersRef.current });
      return;
    }
    reset();
    setQIdx(qIdx + 1);
  }

  function submitChoose(it: Item): void {
    if (!current) return;
    if (it.isOther) {
      setPhase('other');
      return;
    }
    if (multiSelect) {
      const includesOther = Array.from(picked).some((i) => items[i]?.isOther);
      const labels = Array.from(picked)
        .map((i) => items[i])
        .filter((x): x is Item => !!x && !x.isOther)
        .map((x) => x.label);
      if (includesOther) {
        setPhase('other');
        return;
      }
      if (labels.length === 0) return;
      commit(joinSelected(labels));
      return;
    }
    commit(it.label);
  }

  useInput(
    (ch, key) => {
      if (phase !== 'choose') return;
      if (key.upArrow) {
        setIdx((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
        return;
      }
      if (key.downArrow) {
        setIdx((i) => (items.length ? (i + 1) % items.length : 0));
        return;
      }
      if (key.escape) {
        if (isInGrace()) return;
        if (!escArmed) {
          setEscArmed(true);
          if (escTimerRef.current) clearTimeout(escTimerRef.current);
          escTimerRef.current = setTimeout(() => setEscArmed(false), 1500);
          return;
        }
        if (escTimerRef.current) {
          clearTimeout(escTimerRef.current);
          escTimerRef.current = undefined;
        }
        onAnswer({ answers: answersRef.current, cancelled: true });
        return;
      }
      if (escArmed) setEscArmed(false);
      if (multiSelect && ch === ' ') {
        setPicked((cur) => {
          const next = new Set(cur);
          if (next.has(idx)) next.delete(idx);
          else next.add(idx);
          return next;
        });
        return;
      }
      if (key.return) {
        if (isInGrace()) return;
        const it = items[idx];
        if (it) submitChoose(it);
      }
    },
    { isActive: phase === 'choose' },
  );

  useInput(
    (_ch, key) => {
      if (phase !== 'other') return;
      if (key.escape) {
        setPhase('choose');
        setOtherText('');
      }
    },
    { isActive: phase === 'other' },
  );

  if (!current) return null;

  const progress = total > 1 ? ` ${qIdx + 1}/${total}` : '';
  const headerLine = `[${current.header}]${progress}`;

  if (phase === 'other') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={t.info} paddingX={1}>
        <Text color={t.muted}>{headerLine}</Text>
        <Text color={t.info} bold>{current.question}</Text>
        <Box marginTop={1}>
          <Text color={t.text}>your answer: </Text>
          <SimpleTextInput
            value={otherText}
            onChange={setOtherText}
            onSubmit={(v) => {
              const trimmed = v.trim();
              if (!trimmed && !multiSelect) {
                setPhase('choose');
                return;
              }
              if (multiSelect) {
                const labels = Array.from(picked)
                  .map((i) => items[i])
                  .filter((x): x is Item => !!x && !x.isOther)
                  .map((x) => x.label);
                commit(joinSelected(labels, trimmed));
              } else {
                commit(trimmed);
              }
            }}
            placeholder="type your answer, enter to send, esc to go back"
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={t.info} paddingX={1}>
      <Text color={t.muted}>{headerLine}</Text>
      <Text color={t.info} bold>{current.question}</Text>
      <Box flexDirection="column" marginTop={1}>
        {items.map((opt, i) => {
          const isFocused = i === idx;
          const isChecked = multiSelect && picked.has(i);
          const marker = multiSelect ? (isChecked ? '[x]' : '[ ]') : isFocused ? '>' : ' ';
          const labelColor = isFocused ? t.accent : t.text;
          return (
            <Box flexDirection="column" key={`opt-${i}`}>
              <Box>
                <Text color={isFocused ? t.accent : t.muted}>{marker} </Text>
                <Text color={labelColor} bold={isFocused} italic={opt.isOther === true}>
                  {opt.label}
                </Text>
              </Box>
              {opt.description && (
                <Box marginLeft={4}>
                  <Text color={t.muted} wrap="wrap">{opt.description}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={t.muted}>
          {escArmed
            ? 'press esc again to cancel'
            : multiSelect
            ? 'up/dn move, space toggle, enter submit, esc esc cancel'
            : 'up/dn move, enter pick, esc esc cancel'}
        </Text>
      </Box>
    </Box>
  );
}
