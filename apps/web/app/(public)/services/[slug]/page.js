import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchService, fetchServices, fetchCompany } from '@/lib/api';
import { buildMetadata, serviceSchema, faqSchema, breadcrumbSchema, organizationSchema, stripHtml } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section, SectionHeading } from '@/components/site/Section';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { ProjectCard, EmptyState } from '@/components/site/Card';
import { ArrowLink } from '@/components/ui/Button';
import { ContactCta } from '@/components/site/home-sections';
import { FolderKanban, HelpCircle } from 'lucide-react';

/**
 * Service detail.
 *
 * Data-driven from the database: publishing a service with the slug
 * "search-engine-optimization" makes /services/search-engine-optimization exist
 * immediately, and it appears in the sitemap on the next regeneration.
 *
 * A slug that is not published returns a real 404, not an empty page, so
 * unpublished content cannot be probed by guessing URLs.
 */

export async function generateMetadata({ params }) {
  const { slug } = await params;

  const result = await fetchService(slug).catch(() => null);
  if (!result?.service) {
    return buildMetadata({ title: 'Service not found', path: `/services/${slug}`, noindex: true });
  }

  const { service } = result;
  const company = await fetchCompany().catch(() => null);

  return buildMetadata({
    // The admin's meta title wins; the service title is the fallback.
    title: service.metaTitle || service.title,
    description: service.metaDescription || service.summary || service.description,
    path: `/services/${service.slug}`,
    image: service.image?.url || null,
  });
}

export default async function ServiceDetailPage({ params }) {
  const { slug } = await params;

  const [result, company] = await Promise.all([
    fetchService(slug).catch(() => null),
    fetchCompany().catch(() => null),
  ]);

  if (!result?.service) notFound();

  const { service, projects } = result;

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Services', href: '/services' },
    { label: service.title, href: `/services/${service.slug}` },
  ];

  // Other services, for internal linking. Excludes the current one.
  const others = (await fetchServices().catch(() => []))
    .filter((entry) => entry.slug !== service.slug)
    .slice(0, 3);

  const description = stripHtml(service.description);
  const paragraphs = description.split(/\n{2,}/).filter(Boolean);

  return (
    <>
      <JsonLd
        data={[
          organizationSchema(company),
          serviceSchema(service, company),
          // FAQ markup is emitted only for questions an administrator actually
          // added and that are visible on the page below.
          faqSchema(service.faq),
          breadcrumbSchema(trail),
        ]}
        id="ld-service"
      />

      <Section tone="dark" size="tight" className="pb-0">
        <div className="max-w-3xl">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />

          <p className="mb-3 flex items-center gap-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-accent-400">
            <span className="accent-rule" aria-hidden="true" />
            Service
          </p>

          <h1 className="text-h1 text-white">{service.title}</h1>

          {service.summary ? <p className="mt-5 text-lead text-white/70">{service.summary}</p> : null}
        </div>
      </Section>

      {paragraphs.length ? (
        <Section>
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-8">
              <div className="prose-content max-w-none">
                {paragraphs.map((paragraph, index) => (
                  <p key={index} className={index === 0 ? 'mt-0' : ''}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>

            <aside className="lg:col-span-4">
              <div className="rounded-lg border border-line bg-surface-muted p-6">
                <h2 className="text-h4">Talk to us about this</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
                  Tell us what you are trying to achieve and we will tell you honestly whether this is the right
                  approach.
                </p>
                <div className="mt-5">
                  <ArrowLink href="/contact">Start a conversation</ArrowLink>
                </div>
              </div>
            </aside>
          </div>
        </Section>
      ) : null}

      {/* Real case studies for this service. Rendered only when some exist. */}
      {projects?.length ? (
        <Section tone="muted">
          <SectionHeading eyebrow="Related work" title={`${service.title} case studies`} />

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* FAQ, from administrator-authored entries. */}
      {service.faq?.length ? (
        <Section>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-h2">Frequently asked questions</h2>

            <div className="mt-8 divide-y divide-line border-y border-line">
              {service.faq.map((entry) => (
                <details key={entry.question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                    <span>{entry.question}</span>
                    <HelpCircle
                      className="mt-0.5 size-5 shrink-0 text-brand-500 transition-transform group-open:rotate-90"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">{entry.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </Section>
      ) : null}

      {others.length ? (
        <Section tone="muted" size="tight">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-h3">Other services</h2>

            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {others.map((other) => (
                <li key={other.slug}>
                  <Link
                    href={`/services/${other.slug}`}
                    className="text-sm font-semibold text-brand-600 underline-offset-4 hover:underline"
                  >
                    {other.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ) : null}

      <ContactCta company={company} />
    </>
  );
}

export { EmptyState, FolderKanban };