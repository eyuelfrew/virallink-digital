'use client';

import { useEffect, useRef } from 'react';

/**
 * Reading-progress bar.
 *
 * A 2px gold line fixed under the header that fills as the page is scrolled.
 * Painting via `scaleX` on a transform keeps the update on the compositor, so
 * scrolling with the bar visible stays smooth even on low-end phones.
 */

export default function ScrollProgress() {
  const ref = useRef(null);

  useEffect(() => {
    const bar = ref.current;

    if (!bar) return undefined;

    let ticking = false;

    const update = () => {
      ticking = false;

      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;

      // A short page has nothing to fill; leave the bar empty rather than full.
      const progress = max > 0 ? Math.min(window.scrollY / max, 1) : 0;

      bar.style.transform = `scaleX(${progress})`;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    update();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5" aria-hidden="true">
      <div
        ref={ref}
        className="h-full origin-left bg-accent-400"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );
}
