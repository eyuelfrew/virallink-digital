import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * Public-site cache invalidation.
 *
 * The public site reads the API through `cachedGet`, which stores each response
 * in the Next data cache under a tag. The API drops its own cache when an
 * administrator writes (see `invalidatePublicContent` in the API's public
 * service), but that is a different process with a different cache — the site's
 * copy kept serving whatever it had fetched first.
 *
 * So every admin mutation that can change the public site is mapped here to the
 * tags and paths it affects, and those are purged the moment the write lands.
 * Without this, publishing an employee or a project left the site unchanged
 * until the revalidation window expired.
 */

/** Tags attached to the cached public reads. */
export const PUBLIC_TAGS = {
  company: 'public:company',
  services: 'public:services',
  portfolio: 'public:portfolio',
  team: 'public:team',
  clients: 'public:clients',
  testimonials: 'public:testimonials',
  jobs: 'public:jobs',
  blog: 'public:blog',
};

/** Every public path, for the writes that can affect more than one area. */
const ALL_PUBLIC_PATHS = ['/', '/about', '/team', '/clients', '/services', '/portfolio', '/blog', '/careers'];

/**
 * Admin resource prefix -> the public content it can change.
 *
 * The prefix is the first segment of the admin API path, so `employees` covers
 * both `GET /employees` and `PUT /employees/:id`.
 */
const AFFECTS = {
  company: { tags: [PUBLIC_TAGS.company], paths: ['/', '/about'] },
  employees: { tags: [PUBLIC_TAGS.team], paths: ['/team', '/'] },
  departments: { tags: [PUBLIC_TAGS.team], paths: ['/team'] },
  clients: { tags: [PUBLIC_TAGS.clients], paths: ['/clients', '/'] },
  services: { tags: [PUBLIC_TAGS.services], paths: ['/services', '/'] },
  portfolio: { tags: [PUBLIC_TAGS.portfolio], paths: ['/portfolio', '/'] },
  blog: { tags: [PUBLIC_TAGS.blog], paths: ['/blog', '/'] },
  jobs: { tags: [PUBLIC_TAGS.jobs], paths: ['/careers', '/'] },
  testimonials: { tags: [PUBLIC_TAGS.testimonials], paths: ['/'] },
  // Media appears on nearly every public page, so a media write clears them all.
  media: { tags: Object.values(PUBLIC_TAGS), paths: ALL_PUBLIC_PATHS },
};

/**
 * Purge the public content an admin write could have changed.
 *
 * Safe to call for a resource that does not affect the site: it simply does
 * nothing. Never throws, because a cache purge failing must not turn a
 * successful save into an error for the administrator.
 */
export function revalidatePublicContent(resource) {
  const affected = AFFECTS[resource];

  if (!affected) return;

  try {
    for (const tag of affected.tags) {
      // 'max' is the documented profile for invalidating a tag from a Route
      // Handler. `updateTag` would be stronger but is Server-Action only.
      revalidateTag(tag, 'max');
    }

    for (const path of affected.paths) {
      revalidatePath(path);
    }
  } catch {
    // A failed purge means the site serves its cached copy a little longer.
    // The revalidation window still bounds how stale it can get.
  }
}
