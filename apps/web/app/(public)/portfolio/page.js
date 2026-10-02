import { fetchProjects, fetchServices, fetchCompany } from '@/lib/api';
import { buildMetadata, breadcrumbSchema, organizationSchema, itemListSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section } from '@/components/site/Section';
import { PageHeader } from '@/components/site/PageHeader';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { ProjectCard, EmptyState } from '@/components/site/Card';
import { Pagination } from '@/components/site/Pagination';
import { ContactCta } from '@/components/site/home-sections';
import { cn } from '@/lib/utils';
import { FolderKanban } from 'lucide-react';

/**
 * Portfolio index.
 *
 * Filterable by service and paginated. Both the filter and the page live in the
 * URL so a view can be shared, bookmarked and crawled, and the page stays a
 * Server Component with no client-side data fetching.
 */
export async function generateMetadata({ searchParams }) {
  const params = await searchParams;

  // Filtered views are not indexed: they are near-duplicates of the main list,
  // and indexing them all dilutes the canonical page.
  const isFiltered = Boolean(params?.service);

  let company = null;
  try {
    company = await fetchCompany();
  } catch {
    company = null;
  }

  return buildMetadata({
    title: isFiltered ? 'Filtered case studies' : 'Case studies',
    description:
      company?.metaDescription ||
      'Selected projects and case studies from Virallink, with the brief, the approach and the outcome.',
    path: '/portfolio',
    noindex: isFiltered,
  });
}

export default async function PortfolioPage({ searchParams }) {
  const params = await searchParams;

  const page = Math.max(1, Number(params?.page) || 1);
  const activeService = params?.service || null;

  const [{ projects, meta }, services, company] = await Promise.all([
    fetchProjects({ page, pageSize: 12, service: activeService }).catch(() => ({
      projects: [],
      meta: { page: 1, pageSize: 12, total: 0, totalPages: 0 },
    })),
    fetchServices().catch(() => []),
    fetchCompany().catch(() => null),
  ]);

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Case studies', href: '/portfolio' },
  ];

  const activeServiceTitle = services.find((service) => service.slug === activeService)?.title;

  // The filter link carries the page number forward, so switching filter while on
  // page 3 does not leave the visitor stranded.
  const filterHref = (slug) => (slug ? `/portfolio?service=${slug}` : '/portfolio');

  return (
    <>
      <JsonLd
        data={[
          organizationSchema(company),
          breadcrumbSchema(trail),
          itemListSchema(projects, {
            name: 'Case studies',
            path: (item) => `/portfolio/${item.slug}`,
          }),
        ]}
        id="ld-portfolio"
      />

      <PageHeader
        eyebrow="Our work"
        title="Case studies"
        description="The brief, what we did, and what changed. Published case studies only."
        breadcrumb={<Breadcrumbs trail={trail} />}
      />

      <Section className="pt-0">
        {/* Filter. Rendered only when there is more than one service, since a
            single filter is noise. */}
        {services.length > 1 ? (
          <nav aria-label="Filter case studies by service" className="mb-10 flex flex-wrap gap-2">
            <FilterLink href={filterHref(null)} active={!activeService}>
              All
            </FilterLink>

            {services.map((service) => (
              <FilterLink key={service.slug} href={filterHref(service.slug)} active={activeService === service.slug}>
                {service.title}
              </FilterLink>
            ))}
          </nav>
        ) : null}

        {activeServiceTitle ? (
          <p className="mb-6 text-sm text-ink-muted">
            Showing case studies for <span className="font-semibold text-ink">{activeServiceTitle}</span>.
          </p>
        ) : null}

        {projects.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, index) => (
              <ProjectCard key={project.slug} project={project} priority={index < 3} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FolderKanban}
            title={activeService ? 'No case studies in this category yet' : 'No case studies published yet'}
            description={
              activeService
                ? 'Try another category, or view all of our work.'
                : 'Published projects will appear here, each with its own page.'
            }
          />
        )}

        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          basePath={activeService ? `/portfolio?service=${activeService}` : '/portfolio'}
        />
      </Section>

      <ContactCta company={company} />
    </>
  );
}

function FilterLink({ href, active, children }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-9 items-center rounded-md border px-3.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-line text-ink-soft hover:border-brand-300 hover:text-brand-600',
      )}
    >
      {children}
    </a>
  );
}