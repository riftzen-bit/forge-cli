// Session-level counters (turns, tokens, cost) kept in a ref so that every
// usage delta from the agent client does not trigger a re-render. The token
// total is mirrored into state because StatusBar needs to re-render when it
// changes.

import { useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { UsageDelta } from '../../agent/client.js';
import { estimateCost } from '../../agent/pricing.js';
import type { SessionStats } from './types.js';

export type SessionStatsApi = {
  sessionStatsRef: MutableRefObject<SessionStats>;
  tokens: number;
  setTokens: (n: number) => void;
  handleTokens: (total: number) => void;
  handleUsage: (u: UsageDelta) => void;
};

export function useSessionStats(activeModel: string): SessionStatsApi {
  const [tokens, setTokens] = useState(0);
  const sessionStatsRef = useRef<SessionStats>({
    turns: 0,
    toolCalls: {},
    startedAt: Date.now(),
    totalInput: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    totalCacheWrite: 0,
    totalCostUsd: 0,
  });

  const handleTokens = (total: number) => {
    setTokens(total);
  };

  const handleUsage = (u: UsageDelta) => {
    const s = sessionStatsRef.current;
    s.totalInput += u.input;
    s.totalOutput += u.output;
    s.totalCacheRead += u.cacheRead;
    s.totalCacheWrite += u.cacheWrite;
    s.totalCostUsd += estimateCost(activeModel, u);
  };

  return {
    sessionStatsRef,
    tokens,
    setTokens,
    handleTokens,
    handleUsage,
  };
}
