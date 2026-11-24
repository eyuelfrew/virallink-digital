import Link from 'next/link';
import { mapEmbedUrl, mapLinkUrl, hasCoordinates } from '@/lib/map';
import { SectionHeading } from '@/components/site/Section';
import { cn } from '@/lib/utils';
import { MapPin, ExternalLink } from 'lucide-react';

/**
 * Company location map.
 *
 * A keyless Google Maps embed (output=embed), so there is no API key to manage
 * and no cost. The section hides itself entirely when no coordinates have been
 * set — no empty map or placeholder frame on a site that has not configured it.
 *
 * The iframe is lazy-loaded and titled for screen readers. Visitors who would
 * rather use their own maps app get a plain link to the same coordinates.
 */
export function CompanyMap({ company, eyebrow = 'Find us', title = 'Where to find us', className = '' }) {
  if (!hasCoordinates(company)) return null;

  const embedUrl = mapEmbedUrl(company);
  const linkUrl = mapLinkUrl(company);

  const address = [company.addressLine1, company.addressLine2, company.city, company.region, company.country]
    .filter(Boolean)
    .join(', ');

  return (
    <div className={cn('flex flex-col gap-8', className)}>
      <SectionHeading eyebrow={eyebrow} title={title} description={address || undefined} />

      <div className="overflow-hidden rounded-lg border border-line bg-surface-muted shadow-sm">
        <iframe
          src={embedUrl}
          title={`Map showing ${company.name}'s location`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="block h-[22rem] w-full border-0 sm:h-[26rem]"
          allowFullScreen
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          <MapPin className="size-4 shrink-0 text-brand-500" aria-hidden="true" />
          {address || 'Our office'}
        </span>
        {linkUrl ? (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline"
          >
            Open in Google Maps
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default CompanyMap;
