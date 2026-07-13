import { useState, useEffect, useRef } from 'react';

// Animates a number from 0 up to `value` over ~1s using requestAnimationFrame
// (easeOutCubic). Respects prefers-reduced-motion by jumping straight to the
// final value. No dependencies — pure RAF, safe to Phase 5 design-token swap.
export function useCountUp(value, { duration = 1000 } = {}) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const rafRef = useRef();

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || duration <= 0) {
      setDisplay(target);
      return undefined;
    }

    let start;
    const step = (ts) => {
      if (start === undefined) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(target * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    setDisplay(0);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}
