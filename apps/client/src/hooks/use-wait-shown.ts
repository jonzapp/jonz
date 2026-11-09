import { useEffect, useRef, useState } from 'react';

import { WAIT_DELAY, WAIT_MIN } from '@/theme';

/**
 * Whether a wait should show: false for the first WAIT_DELAY ms, so a fast
 * read never flashes, then true until the wait ends, and for at least
 * WAIT_MIN ms once shown, so it never blinks. For an outline (`Waiting`), a
 * busy button and a list's search line.
 */
export function useWaitShown(waiting: boolean): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (waiting === shown) return;
    const wait = waiting ? WAIT_DELAY : Math.max(0, WAIT_MIN - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      if (waiting) shownAt.current = Date.now();
      setShown(waiting);
    }, wait);
    return () => clearTimeout(timer);
  }, [waiting, shown]);
  return shown;
}
