// Owns the three streaming buffers (main thinking, main text, subagent
// previews). Each buffer is a ref that accumulates deltas from the agent
// client; a timer flushes the ref into React state at a fixed cadence so
// the UI updates smoothly without re-rendering on every token.
//
// All three buffers share the same busy-gate: when busy goes false the
// interval clears itself, and streamingText/subPreviews are reset.

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../MessageList.js';
import type { SubPreview } from './types.js';

// Flush cadences. Kept out of sync with each other on purpose so that a
// render caused by one buffer is unlikely to race with another; if they
// all fired at 100ms we'd get thrashing.
const THINKING_FLUSH_MS = 80;
const STREAM_FLUSH_MS = 120;
const SUB_FLUSH_MS = 150;

export type StreamState = {
  thinking: string;
  streamingText: string;
  subPreviews: SubPreview[];
  handleThinking: (delta: string) => void;
  handleText: (delta: string) => void;
  pushSubDelta: (tag: string, field: 'thinking' | 'text', delta: string) => void;
  removeSubPreview: (tag: string) => void;
  // Push the accumulated thinking text into the history as a 'thinking'
  // message and clear both the buffer and the visible state.
  flushThinking: () => void;
  // Zero the thinking buffer without pushing to history. Used at the start
  // of a new turn.
  resetThinking: () => void;
  // Commit a single assistant text block to history and clear the live
  // streaming buffer/state. Called once per text block emitted by the model
  // so each block renders as its own '* forge' message instead of every
  // block in a turn collapsing into one bloated bordered chunk. Pass the
  // full block text from the assistant event when available; falls back to
  // the streaming buffer when called defensively at end-of-turn.
  flushStreaming: (text?: string) => void;
  // Zero the streaming buffer and visible state. Used when busy flips off
  // without committing (e.g. error path where flushStreaming already ran).
  resetStreaming: () => void;
};

export function useStreamState(
  busy: boolean,
  appendHistory: (msg: ChatMessage) => void,
): StreamState {
  const [thinking, setThinking] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [subPreviews, setSubPreviews] = useState<SubPreview[]>([]);

  const thinkingAccumRef = useRef('');
  const thinkingPendingRef = useRef(false);
  const streamTextRef = useRef('');
  const streamFlushPendingRef = useRef(false);
  const subPreviewsRef = useRef<Map<string, SubPreview>>(new Map());
  const subPendingRef = useRef(false);

  // Flush accumulated thinking deltas into visible state at a fixed cadence.
  useEffect(() => {
    if (!busy) return;
    let lastLen = 0;
    const id = setInterval(() => {
      if (!thinkingPendingRef.current) return;
      thinkingPendingRef.current = false;
      const cur = thinkingAccumRef.current;
      if (cur.length !== lastLen) {
        lastLen = cur.length;
        setThinking(cur);
      }
    }, THINKING_FLUSH_MS);
    return () => clearInterval(id);
  }, [busy]);

  // Flush streaming reply text. On busy false, also zero the buffer so a
  // stale preview doesn't flash back if a new turn starts quickly.
  useEffect(() => {
    if (!busy) {
      if (streamingText) setStreamingText('');
      streamTextRef.current = '';
      streamFlushPendingRef.current = false;
      return;
    }
    let lastFlushed = '';
    const id = setInterval(() => {
      if (!streamFlushPendingRef.current) return;
      streamFlushPendingRef.current = false;
      const cur = streamTextRef.current;
      if (cur !== lastFlushed) {
        lastFlushed = cur;
        setStreamingText(cur);
      }
    }, STREAM_FLUSH_MS);
    return () => clearInterval(id);
    // streamingText intentionally excluded: reading it inside the effect
    // would re-create the interval on every flush.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // Flush subagent previews. On busy false, clear the whole map.
  useEffect(() => {
    if (!busy) {
      subPreviewsRef.current.clear();
      subPendingRef.current = false;
      setSubPreviews([]);
      return;
    }
    const id = setInterval(() => {
      if (!subPendingRef.current) return;
      subPendingRef.current = false;
      setSubPreviews([...subPreviewsRef.current.values()]);
    }, SUB_FLUSH_MS);
    return () => clearInterval(id);
  }, [busy]);

  const handleThinking = (delta: string) => {
    thinkingAccumRef.current += delta;
    thinkingPendingRef.current = true;
  };

  const handleText = (delta: string) => {
    streamTextRef.current += delta;
    streamFlushPendingRef.current = true;
  };

  const pushSubDelta = (tag: string, field: 'thinking' | 'text', delta: string) => {
    const prev = subPreviewsRef.current.get(tag);
    const base: SubPreview = prev ?? { tag, thinking: '', text: '', startedAt: Date.now() };
    const next: SubPreview = { ...base, [field]: base[field] + delta };
    subPreviewsRef.current.set(tag, next);
    subPendingRef.current = true;
  };

  const removeSubPreview = (tag: string) => {
    if (subPreviewsRef.current.delete(tag)) subPendingRef.current = true;
  };

  const flushThinking = () => {
    if (thinkingAccumRef.current.trim()) {
      const full = thinkingAccumRef.current.replace(/\s+/g, ' ').trim();
      appendHistory({ role: 'thinking', text: full });
    }
    thinkingAccumRef.current = '';
    thinkingPendingRef.current = false;
    setThinking('');
  };

  const resetThinking = () => {
    thinkingAccumRef.current = '';
    thinkingPendingRef.current = false;
    setThinking('');
  };

  const resetStreaming = () => {
    streamTextRef.current = '';
    streamFlushPendingRef.current = false;
    setStreamingText('');
  };

  const flushStreaming = (text?: string) => {
    const final = (text ?? streamTextRef.current).trim();
    if (final) {
      appendHistory({ role: 'assistant', text: final });
    }
    streamTextRef.current = '';
    streamFlushPendingRef.current = false;
    setStreamingText('');
  };

  return {
    thinking,
    streamingText,
    subPreviews,
    handleThinking,
    handleText,
    pushSubDelta,
    removeSubPreview,
    flushThinking,
    resetThinking,
    flushStreaming,
    resetStreaming,
  };
}
