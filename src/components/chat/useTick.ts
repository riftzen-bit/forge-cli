// Shared animation tick hook for panels that need a spinner frame or a
// periodically-refreshing `now` timestamp. Consolidating this in one place
// keeps the render-rate story explicit: any component that calls useTick is
// a potential source of re-renders while streaming.

import { useEffect, useState } from 'react';

// Circular spinner frames used by ActiveToolsPanel.
export const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];

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
