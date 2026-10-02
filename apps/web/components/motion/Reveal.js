'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Scroll reveal.
 *
 * A thin wrapper around IntersectionObserver that adds `.is-visible` once the
 * element enters the viewport. The movement, delay and easing live in the
 * `.reveal` classes in globals.css, so this stays a tiny client component with
 * no animation library in it — and everything inside it still renders on the
 * server, because children pass straight through as props.
 *
 * `delay` staggers siblings (in milliseconds): pass `index * 60` from a `.map`
 * and a grid cascades in instead of arriving as one block.
 */

export function Reveal({
  children,
  className,
  delay = 0,
  direction = 'up',
  as: Tag = 'div',
  once = true,
  amount = 0.15,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;

    if (!node) return undefined;

    // Motion is a courtesy: if the browser reports a reduced-motion preference,
    // the element is simply shown.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.classList.add('is-visible');
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            entry.target.classList.remove('is-visible');
          }
        }
      },
      { threshold: amount, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [once, amount]);

  const directionClass =
    direction === 'left' ? 'reveal-left' : direction === 'right' ? 'reveal-right' : direction === 'zoom' ? 'reveal-zoom' : '';

  return (
    <Tag
      ref={ref}
      className={cn('reveal', directionClass, className)}
      style={delay ? { '--reveal-delay': `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
