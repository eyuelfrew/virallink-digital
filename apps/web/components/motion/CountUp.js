'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animated figure.
 *
 * Counts up to the target when scrolled into view, once. Company stats arrive
 * as display strings — "120+", "98%", "5" — so the numeric part is animated and
 * any prefix/suffix is kept verbatim. A value that is not numeric at all is
 * rendered unchanged.
 */

function parseValue(raw) {
  const match = String(raw).trim().match(/^([^0-9]*)([\d.,]+)(.*)$/);

  if (!match) return null;

  const number = Number.parseFloat(match[2].replace(/,/g, ''));

  if (!Number.isFinite(number)) return null;

  const decimals = (match[2].split('.')[1] || '').length;

  return { prefix: match[1], number, decimals, suffix: match[3] };
}

export default function CountUp({ value, className, duration = 1400 }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(null);
  const parsed = parseValue(value);

  useEffect(() => {
    const node = ref.current;

    if (!node || !parsed) return undefined;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(null); // null renders the original string untouched
      return undefined;
    }

    let frame = 0;
    let started = false;

    const run = () => {
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        // easeOutExpo: fast departure, gentle landing.
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

        setDisplay(parsed.prefix + (parsed.number * eased).toFixed(parsed.decimals) + parsed.suffix);

        if (progress < 1) frame = requestAnimationFrame(tick);
        else setDisplay(null); // settle on the exact original string
      };

      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started) {
            started = true;
            run();
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [parsed, duration]);

  return (
    <span ref={ref} className={className}>
      {display ?? value}
    </span>
  );
}
