// Shared animation tick hook for panels that need a spinner frame or a
// periodically-refreshing `now` timestamp. Consolidating this in one place
// keeps the render-rate story explicit: any component that calls useTick is
// a potential source of re-renders while streaming.

import { useEffect, useState } from 'react';
import { SPINNER_BRAILLE, PULSE } from '../../ui/glyphs.js';

// Re-export so existing call sites (ActiveToolsPanel) don't have to import
// from two places. The frame array is a moving braille arc — reads as one
// continuous spin instead of the four-frame ASCII chop.
export const SPINNER_FRAMES = SPINNER_BRAILLE;
export const PULSE_FRAMES = PULSE;

export function useTick(ms: number): { frame: number; now: number } {
  const [frame, setFrame] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
      setNow(Date.now());
    }, ms);
    return () => clearInterval(id);
  }, [ms]);

  return { frame, now };
}

// Pulse cadence — slower than the spinner so panels with both don't beat
// against each other.
export function usePulse(ms = 220): { frame: number; now: number } {
  const [frame, setFrame] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % PULSE_FRAMES.length);
      setNow(Date.now());
    }, ms);
    return () => clearInterval(id);
  }, [ms]);

  return { frame, now };
}
