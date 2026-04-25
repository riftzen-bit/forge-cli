import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../ui/theme.js';

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'code'; lang?: string; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' }
  | { kind: 'para'; text: string };

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^\s*$/.test(line)) { i++; continue; }

    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] || undefined;
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) {
        body.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++;
      const codeBlock: Block = { kind: 'code', text: body.join('\n') };
      if (lang !== undefined) codeBlock.lang = lang;
      blocks.push(codeBlock);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!.trim(),
      });
      i++;
      continue;
    }

    if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      const body: string[] = [quote[1]!];
      i++;
      while (i < lines.length) {
        const m = lines[i]!.match(/^\s*>\s?(.*)$/);
        if (!m) break;
        body.push(m[1]!);
        i++;
      }
      blocks.push({ kind: 'quote', text: body.join('\n') });
      continue;
    }

    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]!) &&
      !/^\s*```/.test(lines[i]!) &&
      !/^#{1,3}\s+/.test(lines[i]!) &&
      !/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i]!) &&
      !/^\s*>\s?/.test(lines[i]!)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    blocks.push({ kind: 'para', text: paraLines.join(' ') });
  }
  return blocks;
}

type Span =
  | { kind: 'plain'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string };

function inline(src: string): Span[] {
  const spans: Span[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) spans.push({ kind: 'plain', text: src.slice(last, m.index) });
    const tok = m[0]!;
    if (tok.startsWith('`')) {
      spans.push({ kind: 'code', text: tok.slice(1, -1) });
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      spans.push({ kind: 'bold', text: tok.slice(2, -2) });
    } else {
      spans.push({ kind: 'italic', text: tok.slice(1, -1) });
    }
    last = m.index + tok.length;
  }
  if (last < src.length) spans.push({ kind: 'plain', text: src.slice(last) });
  return spans;
}

function Inline({ text, color }: { text: string; color?: string }) {
  const t = getTheme();
  const spans = inline(text);
  return (
    <Text>
      {spans.map((s, i) => {
        if (s.kind === 'bold') return <Text key={i} color={color} bold>{s.text}</Text>;
        if (s.kind === 'italic') return <Text key={i} color={color} italic>{s.text}</Text>;
        if (s.kind === 'code') return <Text key={i} color={t.toolTag}>{s.text}</Text>;
        return <Text key={i} color={color}>{s.text}</Text>;
      })}
    </Text>
  );
}

export function Markdown({ text, color }: { text: string; color?: string }) {
  const t = getTheme();
  const blocks = parse(text);
  return (
    <Box flexDirection="column">
      {blocks.map((b, i) => {
        if (b.kind === 'heading') {
          const headColor = b.level === 1 ? t.accent : b.level === 2 ? t.info : t.toolTag;
          // Drop the literal `#` markers — bold + colour already conveys the
          // heading level. Raw `#` glyphs in rendered text read as "the LLM
          // forgot to render its markdown" and add visual noise.
          return (
            <Box key={i} marginTop={i === 0 ? 0 : 1}>
              <Text color={headColor} bold>{b.text}</Text>
            </Box>
          );
        }
        if (b.kind === 'hr') {
          return (
            <Box key={i}>
              <Text color={t.muted}>{'─'.repeat(40)}</Text>
            </Box>
          );
        }
        if (b.kind === 'code') {
          return (
            <Box
              key={i}
              flexDirection="column"
              borderStyle="single"
              borderColor={t.muted}
              paddingX={1}
              marginY={1}
            >
              {b.lang && <Text color={t.muted}>{b.lang}</Text>}
              {b.text.split('\n').map((ln, j) => (
                <Text key={j} color={t.toolTag}>{ln}</Text>
              ))}
            </Box>
          );
        }
        if (b.kind === 'list') {
          return (
            <Box key={i} flexDirection="column">
              {b.items.map((it, j) => (
                <Box key={j}>
                  <Text color={t.muted}>{b.ordered ? `${j + 1}. ` : '- '}</Text>
                  <Inline text={it} color={color} />
                </Box>
              ))}
            </Box>
          );
        }
        if (b.kind === 'quote') {
          return (
            <Box
              key={i}
              borderStyle="single"
              borderLeft
              borderTop={false}
              borderRight={false}
              borderBottom={false}
              borderColor={t.muted}
              paddingLeft={1}
            >
              <Inline text={b.text} color={t.muted} />
            </Box>
          );
        }
        return (
          <Box key={i}>
            <Inline text={b.text} color={color} />
          </Box>
        );
      })}
    </Box>
  );
}
