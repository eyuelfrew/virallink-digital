import Image from 'next/image';
import { BRAND } from '@/lib/config';
import { cn } from '@/lib/utils';

/**
 * Fallbacks for the scroll story.
 *
 * Two states share this file because they render the same branded panel:
 *
 *  - ExperienceFallback: shown while the 3D bundle lazy-loads. Fixed to the
 *    sticky canvas slot, so the page height never changes when the canvas
 *    swaps in (no layout shift).
 *  - ExperienceUnavailable: the permanent, lightweight alternative when
 *    WebGL is missing or the visitor prefers reduced motion. Same panel,
 *    different copy, nothing animated beyond CSS.
 *
 * Both are Server Components — they cost zero JavaScript.
 */

export function ExperienceFallback({ label = 'Loading experience', className }) {
  return (
    <div
      className={cn(
        'flex size-full flex-col items-center justify-center overflow-hidden bg-brand-950',
        className,
      )}
      aria-hidden="true"
    >
      {/* Faint blueprint grid so the panel reads as part of the story, not a
          broken image. Pure CSS, no assets, no JS. */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent-400/20"
        style={{ boxShadow: '0 0 120px 20px rgba(2, 82, 152, 0.35)' }}
      />

      <div className="relative flex flex-col items-center gap-5">
        <Image
          src={BRAND.logoWhitePath}
          alt=""
          width={96}
          height={58}
          className="h-9 w-auto opacity-90"
          priority
        />
        <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-white/50">
          <span
            className="inline-block size-3 rounded-full border-2 border-accent-400/30 border-t-accent-400 motion-safe:animate-spin"
            style={{ animationDuration: '1.2s' }}
          />
          {label}
        </div>
      </div>
    </div>
  );
}

export function ExperienceUnavailable({ title, description, className }) {
  return (
    <div
      className={cn(
        'relative flex size-full items-center justify-center overflow-hidden bg-brand-950',
        className,
      )}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div className="relative mx-auto max-w-md px-6 text-center">
        <Image
          src={BRAND.logoWhitePath}
          alt=""
          width={96}
          height={58}
          className="mx-auto h-10 w-auto opacity-90"
        />
        {title ? <p className="mt-6 text-lg font-semibold text-white">{title}</p> : null}
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-white/60">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
