import React from 'react';
import { Static } from 'ink';
import { Brand } from './Brand.js';
import { Tips } from './Tips.js';
import { MessageRow } from './MessageRow.js';
import type { ChatMessage } from './MessageList.js';
import type { StaticItem } from './chat/types.js';

type Props = {
  items: StaticItem[];
  cwd: string;
  modelLabel: string;
  modeLabel?: string;
  modeColor?: string;
  verbose: boolean;
  // Bumped whenever we want Static to re-emit. Used as React key so the
  // component remounts.
  epoch: number;
};

// Owns the streaming-history scrollback area. Static-emits each item
// exactly once so prior frames freeze in terminal scrollback.
//
// Role-rail layout (no numbering): each row knows whether it's the head
// of its rail group so it can render the role marker once and let
// subsequent rows of the same group flow into the indented content area.
//
//   you      <user msg>
//
//   forge    <assistant msg>
//            <continued assistant text>
//
//   ·  step  <thinking>
//            <tool call>
//            <tool call>
//
//   forge    <reply after tool>
export function Conversation({ items, cwd, modelLabel, verbose, epoch }: Props) {
  const tagged = tagHeads(items);
  return (
    <Static key={`static-${epoch}`} items={tagged}>
      {(item) => {
        if (item.kind === 'banner') {
          return <Brand key={item.id} cwd={cwd} modelLabel={modelLabel} />;
        }
        if (item.kind === 'tips') return <Tips key={item.id} />;
        return (
          <MessageRow
            key={item.id}
            message={item.message}
            verbose={verbose}
            isCellHead={item.isCellHead}
          />
        );
      }}
    </Static>
  );
}

type Tagged =
  | { kind: 'banner'; id: string }
  | { kind: 'tips'; id: string }
  | { kind: 'msg'; id: string; message: ChatMessage; isCellHead: boolean };

// Walk items once and tag each msg with whether it heads a rail group.
//   * user row              → always head (own group)
//   * assistant row         → head when it's the first assistant in the
//                              turn OR when it follows a step group (tool
//                              finished, here's the new reply boundary)
//   * thinking/tool/shell   → head when first step row in this group
function tagHeads(items: StaticItem[]): Tagged[] {
  const out: Tagged[] = [];
  let assistantOpen = false;
  let stepOpen = false;
  for (const it of items) {
    if (it.kind !== 'msg') {
      out.push(it);
      continue;
    }
    const m = it.message;
    if (m.role === 'user') {
      assistantOpen = false;
      stepOpen = false;
      out.push({ kind: 'msg', id: it.id, message: m, isCellHead: true });
      continue;
    }
    if (m.role === 'assistant') {
      const isHead = !assistantOpen || stepOpen;
      assistantOpen = true;
      stepOpen = false;
      out.push({ kind: 'msg', id: it.id, message: m, isCellHead: isHead });
      continue;
    }
    // thinking / tool / shell / system / error → step group
    const isStep = m.role === 'thinking' || m.role === 'tool' || m.role === 'shell';
    const isHead = isStep && !stepOpen;
    if (isStep) stepOpen = true;
    out.push({ kind: 'msg', id: it.id, message: m, isCellHead: isHead });
  }
  return out;
}
