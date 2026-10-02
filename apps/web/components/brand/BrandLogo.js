import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Brand assets.
 *
 * Both variants are rendered from the supplied artwork (`image.avif`, kept at
 * `public/brand/logo.avif`):
 *
 *  - `logo.avif`      blue monogram + gold dove, for light backgrounds
 *  - `logo-white.png` every opaque pixel painted white, same alpha mask, for the
 *                     dark footer band
 *
 * The source is 96 × 58, which is why it is never displayed wider than 96 CSS
 * pixels here — the header and footer both stay inside that budget.
 */

const LOGO_WIDTH = 96;
const LOGO_HEIGHT = 58;

export default function BrandLogo({ className = '', priority = false }) {
  return (
    <Image
      src="/brand/logo.avif"
      alt="Virallink"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority={priority}
      className={cn('h-auto w-auto', className)}
    />
  );
}

/**
 * Favicon-scale mark. The blue app tile with the white monogram, used in the
 * admin sidebar where a wide wordmark would crowd the 16rem rail.
 */
export function BrandMark({ className = '' }) {
  return (
    <Image
      src="/brand/icon-192.png"
      alt=""
      width={48}
      height={48}
      className={cn('rounded-md', className)}
    />
  );
}
