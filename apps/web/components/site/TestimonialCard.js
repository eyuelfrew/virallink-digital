import Image from 'next/image';
import { Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Testimonial.
 *
 * A quotation, not a card: a left rule and generous space rather than a bordered
 * box. Star ratings are rendered only when a rating was actually recorded, since
 * showing five empty stars for a testimonial with no score is a small lie.
 */
export function TestimonialCard({ testimonial, className }) {
  const { authorName, authorPosition, authorCompany, body, rating, authorPhoto } = testimonial;

  return (
    <figure className={cn('flex h-full flex-col border-l-2 border-brand-200 pl-6', className)}>
      <Quote className="size-5 text-brand-300" aria-hidden="true" />

      <blockquote className="mt-4 flex-1 text-[0.9375rem] leading-relaxed text-ink-soft">
        {/* The browser inserts quotation marks; adding them in the copy too would
            double them. */}
        <p>{body}</p>
      </blockquote>

      {rating ? (
        <p className="mt-4 flex gap-0.5" aria-label={`Rated ${rating} out of 5`}>
          {Array.from({ length: 5 }, (unused, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={cn(
                'size-4',
                index < rating ? 'text-accent-400' : 'text-surface-sunken',
              )}
              style={{
                // A filled star drawn inline, so no icon font is needed.
                clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
                backgroundColor: index < rating ? 'var(--accent-400)' : 'var(--surface-sunken)',
              }}
            />
          ))}
        </p>
      ) : null}

      <figcaption className="mt-5 flex items-center gap-3">
        {authorPhoto?.url ? (
          <Image
            src={authorPhoto.url}
            alt={authorPhoto.altText || authorName}
            width={40}
            height={40}
            className="size-10 rounded-full object-cover"
          />
        ) : (
          <span
            className="flex size-10 items-center justify-center rounded-full bg-brand-800 font-sans text-sm font-bold text-white"
            aria-hidden="true"
          >
            {authorName
              .split(' ')
              .map((part) => part[0])
              .slice(0, 2)
              .join('')}
          </span>
        )}

        <span className="text-sm">
          <span className="block font-semibold text-ink">{authorName}</span>
          {[authorPosition, authorCompany].filter(Boolean).length ? (
            <span className="block text-ink-muted">
              {[authorPosition, authorCompany].filter(Boolean).join(', ')}
            </span>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}

export default TestimonialCard;