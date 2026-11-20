import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../lib/motion.js';

/**
 * Animates between numeric KPI values; non-numbers and null are passed through unchanged.
 */
export function useAnimatedNumber(value, duration = 420) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const frameRef = useRef(null);
  const fromRef = useRef(typeof value === 'number' ? value : 0);

  useEffect(() => {
    if (typeof value !== 'number') {
      setDisplay(value);
      return;
    }
    if (reduced) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration, reduced]);

  return display;
}