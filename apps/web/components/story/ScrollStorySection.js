'use client';

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ExperienceFallback, ExperienceUnavailable } from './ExperienceFallback';

/**
 * Scroll story engine.
 *
 * Composition:
 *  - a sticky, full-viewport stage holding the 3D canvas and one HTML slide
 *    per chapter (the slides are server-rendered nodes passed in as props, so
 *    every headline, link and list remains crawlable HTML);
 *  - a scroll spacer below it — one viewport per chapter — which is what the
 *    visitor actually scrolls. Nothing is hijacked: native scrolling drives
 *    everything, and the page scrolls normally at both ends of the story;
 *  - the WebGL experience is lazy-loaded only when the section is near the
 *    viewport, the browser has WebGL, and the visitor has no reduced-motion
 *    preference. Everyone else gets the branded static panel — the story
 *    content is identical either way.
 *
 * During scrolling the only per-frame work is the 3D render loop. React state
 * changes at most when: the section mounts, WebGL capability is decided, the
 * experience goes offscreen, or the active chapter index changes (rAF-throttled,
 * integer-only, so a chapter flip cannot fire more than once per frame).
 */

const Scene = lazy(() => import('./ThreeScene'));

/**
 * chapters: [{ label, node }] — `node` is server-rendered content.
 * Five chapters, five viewports of travel, plus the entering viewport.
 */
const CHAPTER_COUNT = 5;
const SECTION_VH = CHAPTER_COUNT + 1;

export default function ScrollStorySection({ chapters = [], sectionId = 'story', className = '' }) {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);

  const [capability, setCapability] = useState('loading'); // loading | webgl | static
  const [paused, setPaused] = useState(true);
  const [chapter, setChapter] = useState(0);

  /* ---------------- capability: WebGL + reduced motion ---------------- */

  useEffect(() => {
    let cancelled = false;

    const decide = () => {
      if (cancelled) return;

      const reduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (reduced) {
        setCapability('static');
        return;
      }

      let hasWebGL = false;
      try {
        const canvas = document.createElement('canvas');
        hasWebGL = Boolean(
          window.WebGLRenderingContext &&
            (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')),
        );
      } catch {
        hasWebGL = false;
      }

      setCapability(hasWebGL ? 'webgl' : 'static');
    };

    // One frame after hydration, so this never blocks first paint.
    const timer = window.setTimeout(decide, 50);

    // A visitor can toggle reduced motion mid-session; honour it live.
    let media;
    const onPreferenceChange = () => {
      if (!cancelled) decide();
    };
    if (typeof window.matchMedia === 'function') {
      media = window.matchMedia('(prefers-reduced-motion: reduce)');
      media.addEventListener?.('change', onPreferenceChange);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      media?.removeEventListener?.('change', onPreferenceChange);
    };
  }, []);

  /* ---------------- chapter tracking (rAF-throttled, no thrash) ---------------- */

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;

    let frame = 0;
    let last = -1;

    const measure = () => {
      frame = 0;
      const stage = stageRef.current;
      if (!stage) return;

      // Measure the section, not the sticky stage — the stage sits at top: 0
      // the whole time it is stuck, so it cannot report scroll progress.
      const rect = section.getBoundingClientRect();
      const travel = section.offsetHeight - window.innerHeight;
      const progress = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0;
      const next = Math.min(CHAPTER_COUNT - 1, Math.floor(progress * CHAPTER_COUNT));

      if (next !== last) {
        last = next;
        setChapter(next);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  /* ---------------- pause the render loop offscreen ---------------- */

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(([entry]) => setPaused(!entry.isIntersecting), {
      rootMargin: '120px',
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const hasWebGL = capability === 'webgl';

  return (
    <section
      ref={sectionRef}
      id={sectionId}
      className={`relative bg-brand-950 ${className}`}
      style={{ height: `${SECTION_VH * 100}vh` }}
      aria-label="Virallink story"
    >
      {/* Sticky stage: the canvas and the chapter slides both stay here for the
          whole story; the section's extra height provides the scroll travel. */}
      <div ref={stageRef} className="sticky top-0 h-screen overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          {hasWebGL ? (
            <Suspense fallback={<ExperienceFallback />}>
              <Scene sectionRef={sectionRef} paused={paused} />
            </Suspense>
          ) : capability === 'loading' ? (
            <ExperienceFallback label="Preparing experience" />
          ) : (
            <ExperienceUnavailable
              title="The interactive story needs WebGL — or you've asked for less motion"
              description="Everything on this page — services, projects and contact details — is right here as normal text and links."
            />
          )}
        </div>

        {/* Chapter slides. Each chapter's node is server-rendered HTML handed
            down from the home page. Slides are never unmounted, so their links
            never pop in or out of the DOM; inactive ones are opacity-0 and
            inert, which also removes them from the tab order. */}
        <div className="absolute inset-0">
          {chapters.slice(0, CHAPTER_COUNT).map(({ node }, index) => (
            <div
              key={index}
              className="story-slide absolute inset-0 flex items-center"
              data-active={index === chapter ? 'true' : 'false'}
              inert={index === chapter ? undefined : true}
            >
              <div className="container-page w-full">{node}</div>
            </div>
          ))}
        </div>

        {/* Chapter progress. Decorative only; the chapter links in the scroll
            space below are the keyboard and screen-reader path. */}
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2" aria-hidden="true">
          <div className="flex items-center gap-2.5">
            {chapters.slice(0, CHAPTER_COUNT).map((_, index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === chapter ? 'w-8 bg-accent-400' : 'w-3 bg-white/25'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Chapter anchor layer. One labelled, focusable link per chapter at the
          exact scroll position where that chapter begins — usable with the
          keyboard, from screen readers, and as skip targets. */}
      <div className="pointer-events-none absolute inset-0" aria-label="Story chapters">
        {chapters.slice(0, CHAPTER_COUNT).map(({ label }, index) => (
          <div
            key={index}
            id={`${sectionId}-chapter-${index + 1}`}
            className="absolute left-0 w-full"
            style={{ top: `${index * 100}vh`, height: '100vh' }}
          >
            <a
              href={`#${sectionId}-chapter-${index + 1}`}
              className="sr-only focus:not-sr-only focus:pointer-events-auto focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-md focus:bg-accent-400 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-950"
            >
              {label || `Chapter ${index + 1}`}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
