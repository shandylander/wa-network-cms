import { useEffect, useRef, useState } from 'react';

// IntersectionObserver-backed scroll-reveal (fade + rise). Returns a ref to
// attach to the element and an `isVisible` flag to drive a CSS class/style
// (e.g. `opacity: isVisible ? 1 : 0` + `transform: translateY(...)`).
// No-op — immediately visible, no observer set up — under
// prefers-reduced-motion, mirroring the guard already used in useCountUp.
export function useReveal({ threshold = 0.15, rootMargin = '0px', once = true } = {}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setIsVisible(true); return undefined; }

    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setIsVisible(true); return undefined; }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setIsVisible(false);
          }
        });
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, isVisible };
}

export default useReveal;
