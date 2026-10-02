import { absoluteUrl } from '@/lib/utils';
import { SITE_URL, BRAND } from '@/lib/config';
import { titleTemplate, truncateDescription, canonicalUrl } from '@virallink/shared/seo';

/**
 * Metadata and JSON-LD builders.
 *
 * All structured data for the site is generated here so the vocabulary and the
 * shape stay consistent. The rule applied throughout: structured data describes
 * only what the page visibly contains. Marking up a rating or a testimonial that
 * is not rendered is a manual action risk, and this project has none.
 */

/**
 * Page metadata.
 *
 * `title` is passed through the shared title template so every page gets the
 * brand suffix consistently, and `alternates.canonical` is always set so a page
 * can never end up with two indexable URLs.
 */
export function buildMetadata({
  title,
  description,
  path = '/',
  image = null,
  type = 'website',
  publishedTime = null,
  modifiedTime = null,
  authors = null,
  keywords = null,
  noindex = false,
  follow = true,
} = {}) {
  const url = absoluteUrl(path, SITE_URL);
  const resolvedTitle = titleTemplate(title, { titleSuffix: BRAND.name });
  const resolvedDescription = truncateDescription(description || '', 158);

  const ogImage = image
    ? { url: absoluteUrl(image, SITE_URL), width: 1200, height: 630, alt: title || BRAND.name }
    : {
        url: absoluteUrl('/og-default.png', SITE_URL),
        width: 1200,
        height: 630,
        alt: `${BRAND.name} — digital marketing agency`,
      };

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    ...(keywords ? { keywords } : {}),

    alternates: { canonical: canonicalUrl(path, SITE_URL) },

    // robots is emitted even when indexing is allowed, so a page cannot inherit
    // a noindex from a parent layout.
    robots: noindex
      ? { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }
      : { index: true, follow, googleBot: { index: true, follow } },

    openGraph: {
      type,
      url,
      title: resolvedTitle,
      description: resolvedDescription,
      siteName: BRAND.name,
      locale: 'en_ET',
      images: [ogImage],
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
      ...(authors ? { authors } : {}),
    },

    twitter: {
      card: 'summary_large_image',
      title: resolvedTitle,
      description: resolvedDescription,
      images: [ogImage.url],
    },
  };
}

/* -------------------------------------------------------------------------- */
/* JSON-LD                                                                    */
/* -------------------------------------------------------------------------- */

/** Only defined values are emitted, so no `"telephone": null` ever reaches Google. */
function compact(object) {
  const result = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

/** Organization plus LocalBusiness, which is the correct pair for a local agency. */
export function organizationSchema(company) {
  if (!company) return null;

  const sameAs = (company.socialLinks || []).map((link) => link.url);

  const postalAddress = compact({
    streetAddress: [company.addressLine1, company.addressLine2].filter(Boolean).join(', '),
    addressLocality: company.city,
    addressRegion: company.region,
    postalCode: company.postalCode,
    addressCountry: company.country || 'ET',
  });

  const geo = compact({
    latitude: company.latitude,
    longitude: company.longitude,
  });

  const contactPoint = [
    compact({ contactType: 'customer service', telephone: company.phone, email: company.email }),
  ].filter((entry) => entry.telephone || entry.email);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${absoluteUrl('/', SITE_URL)}#organization`,
        name: company.name,
        ...(company.legalName ? { legalName: company.legalName } : {}),
        ...(company.description ? { description: company.description } : {}),
        url: absoluteUrl('/', SITE_URL),
        logo: company.logo?.url
          ? { '@type': 'ImageObject', url: absoluteUrl(company.logo.url, SITE_URL) }
          : absoluteUrl(BRAND.logoPath, SITE_URL),
        ...(company.foundedDate ? { foundingDate: company.foundedDate } : {}),
        ...(sameAs.length ? { sameAs } : {}),
        ...(contactPoint.length ? { contactPoint } : {}),
      },
      {
        // LocalBusiness is a subtype of Organization, so it inherits the identity
        // above via @id and adds the location-specific properties.
        '@type': 'LocalBusiness',
        '@id': `${absoluteUrl('/', SITE_URL)}#localbusiness`,
        name: company.name,
        url: absoluteUrl('/', SITE_URL),
        ...(company.shortDescription ? { description: company.shortDescription } : {}),
        ...(company.logo?.url ? { image: absoluteUrl(company.logo.url, SITE_URL) } : {}),
        ...(Object.keys(postalAddress).length ? { address: { '@type': 'PostalAddress', ...postalAddress } } : {}),
        ...(Object.keys(geo).length ? { geo: { '@type': 'GeoCoordinates', ...geo } } : {}),
        ...(company.phone ? { telephone: company.phone } : {}),
        ...(company.email ? { email: company.email } : {}),
        ...(company.openingHours
          ? { openingHoursSpecification: parseOpeningHours(company.openingHours) }
          : {}),
        ...(company.priceRange ? { priceRange: company.priceRange } : {}),
      },
    ],
  };
}

/**
 * Parse a free-text opening-hours value into schema.org structures.
 *
 * Administrators type hours as "Mon-Fri 09:00-17:00", so that shape is what is
 * parsed. Unparseable text yields no markup rather than incorrect markup.
 */
export function parseOpeningHours(text) {
  const match = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*-\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/i.exec(
    String(text || '').trim(),
  );
  if (!match) return undefined;

  const dayNames = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const days = [dayNames[match[1].toLowerCase()], dayNames[match[2].toLowerCase()]];

  const from = `${match[3].padStart(2, '0')}:${match[4]}`;
  const to = `${match[5].padStart(2, '0')}:${match[6]}`;

  return days.map((day) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: day,
    opens: from,
    closes: to,
  }));
}

/** WebSite with a SearchAction, which is what earns a sitelinks search box. */
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${absoluteUrl('/', SITE_URL)}#website`,
    name: BRAND.name,
    url: absoluteUrl('/', SITE_URL),
    publisher: { '@id': `${absoluteUrl('/', SITE_URL)}#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${absoluteUrl('/blog', SITE_URL)}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function serviceSchema(service, company) {
  if (!service) return null;

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${absoluteUrl(`/services/${service.slug}`, SITE_URL)}#service`,
    name: service.title,
    // One description only: `description` if present, otherwise the summary.
    // Emitting both with the same key twice would silently drop one.
    description: truncateDescription(service.description || service.summary || '', 300),
    serviceType: service.title,
    url: absoluteUrl(`/services/${service.slug}`, SITE_URL),
    // Referencing the Organization by @id links the service to the site's other
    // structured data. Falls back to a named Organization when no company row
    // exists yet, since an @id reference to a missing node is worse than none.
    ...(company
      ? { provider: { '@id': `${absoluteUrl('/', SITE_URL)}#organization` } }
      : {}),
    ...(company?.logo?.url
      ? { provider: { '@type': 'Organization', name: company.name, logo: absoluteUrl(company.logo.url, SITE_URL) } }
      : {}),
    areaServed: company?.country ? { '@type': 'Country', name: company.country } : undefined,
  });
}

/** CreativeWork suits a case study better than the more specific Article. */
export function projectSchema(project, company) {
  if (!project) return null;

  return compact({
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    '@id': `${absoluteUrl(`/portfolio/${project.slug}`, SITE_URL)}#project`,
    name: project.title,
    headline: project.title,
    ...(project.summary ? { description: project.summary } : {}),
    url: absoluteUrl(`/portfolio/${project.slug}`, SITE_URL),
    ...(project.publishedAt ? { datePublished: project.publishedAt } : {}),
    ...(project.cover?.url ? { image: absoluteUrl(project.cover.url, SITE_URL) } : {}),
    ...(project.technologies?.length ? { keywords: project.technologies.join(', ') } : {}),
    ...(company?.name ? { creator: { '@type': 'Organization', name: company.name } } : {}),
    ...(project.client?.name ? { contributor: { '@type': 'Organization', name: project.client.name } } : {}),
    ...(project.service ? { about: { '@type': 'Thing', name: project.service.title } } : {}),
  });
}

export function articleSchema(post, company) {
  if (!post) return null;

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${absoluteUrl(`/blog/${post.slug}`, SITE_URL)}#article`,
    headline: truncateDescription(post.title, 110),
    ...(post.excerpt ? { description: post.excerpt } : {}),
    url: absoluteUrl(`/blog/${post.slug}`, SITE_URL),
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(`/blog/${post.slug}`, SITE_URL) },
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    ...(post.featuredImage?.url ? { image: absoluteUrl(post.featuredImage.url, SITE_URL) } : {}),
    // An Article needs an author. The post's own author is preferred; otherwise
    // the company. This is never left undefined, because an Article without an
    // author is invalid structured data.
    ...(post.author?.name
      ? { author: { '@type': 'Person', name: post.author.name } }
      : { author: { '@type': 'Organization', name: company?.name || BRAND.name } }),
    // Publisher requires both a name and a logo to be valid, so it is only
    // emitted when the logo is actually available.
    ...(company?.logo?.url
      ? {
          publisher: {
            '@type': 'Organization',
            name: company.name || BRAND.name,
            logo: { '@type': 'ImageObject', url: absoluteUrl(company.logo.url, SITE_URL) },
          },
        }
      : {}),
    ...(post.categories?.length ? { articleSection: post.categories[0].name } : {}),
    ...(post.tags?.length ? { keywords: post.tags.map((tag) => tag.name).join(', ') } : {}),
    wordCount: post.content ? stripHtml(post.content).split(/\s+/).filter(Boolean).length : undefined,
    inLanguage: 'en',
  });
}

export function jobSchema(job, company) {
  if (!job) return null;

  // A JobPosting must state where the work happens. A remote role uses
  // jobLocationType alone; an on-site role needs a real address.
  const workplace = job.isRemote
    ? { jobLocationType: 'TELECOMMUTE' }
    : {
        jobLocation: compact({
          '@type': 'Place',
          address: compact({
            '@type': 'PostalAddress',
            addressLocality: job.location,
            addressCountry: company?.country || 'ET',
          }),
        }),
      };

  return compact({
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    ...(job.summary ? { description: job.summary } : {}),
    ...(job.employmentType ? { employmentType: job.employmentType } : {}),
    // `datePosted` is required by the spec, so it is always emitted.
    datePosted: new Date().toISOString().slice(0, 10),
    ...workplace,
    ...(job.closesAt ? { validThrough: job.closesAt } : {}),
    ...(job.applyEmail
      ? {
          applicationContact: {
            '@type': 'Organization',
            email: job.applyEmail,
            name: company?.name || BRAND.name,
          },
        }
      : {}),
    hiringOrganization: {
      '@type': 'Organization',
      name: company?.name || BRAND.name,
      ...(sameAsFirst(company) ? { sameAs: [sameAsFirst(company)] } : {}),
    },
  });
}

function sameAsFirst(company) {
  return company?.socialLinks?.[0]?.url || null;
}

export function faqSchema(faq) {
  if (!Array.isArray(faq) || faq.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

/** Breadcrumbs on every sub-page, mirroring the visible trail. */
export function breadcrumbSchema(trail) {
  if (!Array.isArray(trail) || trail.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: absoluteUrl(item.href, SITE_URL),
    })),
  };
}

/** JobPosting must be on a standalone page, so the index gets an ItemList. */
export function itemListSchema(items, { name, path }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(path(item), SITE_URL),
      name: item.title || item.name,
    })),
  };
}

/** Strip tags for word counts and descriptions. */
export function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export { compact, titleTemplate, truncateDescription };