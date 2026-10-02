import { fetchPosts, fetchBlogTaxonomy, fetchCompany } from '@/lib/api';
import { buildMetadata, breadcrumbSchema, organizationSchema, itemListSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section } from '@/components/site/Section';
import { PageHeader } from '@/components/site/PageHeader';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { PostCard, EmptyState } from '@/components/site/Card';
import { Pagination } from '@/components/site/Pagination';
import { ContactCta } from '@/components/site/home-sections';
import { cn } from '@/lib/utils';
import { Newspaper } from 'lucide-react';

/**
 * Blog index.
 *
 * Only published posts with a publish date in the past are returned by the API,
 * so drafts cannot be listed here. Filterable by category or tag, with the
 * filter in the URL so a filtered view is shareable.
 */
export async function generateMetadata({ searchParams }) {
  const params = await searchParams;

  return buildMetadata({
    title: 'Insights',
    description: 'Practical writing on search, content, web and digital marketing.',
    path: '/blog',
    // Filtered and paginated views are near-duplicates of the canonical index.
    noindex: Boolean(params?.category || params?.tag || params?.page),
  });
}

export default async function BlogPage({ searchParams }) {
  const params = await searchParams;

  const page = Math.max(1, Number(params?.page) || 1);
  const category = params?.category || null;
  const tag = params?.tag || null;

  const [{ posts, meta }, taxonomy, company] = await Promise.all([
    fetchPosts({ page, pageSize: 10, category, tag }).catch(() => ({
      posts: [],
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    })),
    fetchBlogTaxonomy().catch(() => ({ categories: [], tags: [] })),
    fetchCompany().catch(() => null),
  ]);

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Insights', href: '/blog' },
  ];

  // Only the active filter's query string is carried into the pagination links,
  // so paging through a filtered list does not drop the filter.
  const buildBase = (extra = {}) => {
    const search = new URLSearchParams();
    if (category) search.set('category', category);
    if (tag) search.set('tag', tag);
    for (const [key, value] of Object.entries(extra)) search.set(key, value);

    const query = search.toString();
    return query ? `/blog?${query}` : '/blog';
  };

  return (
    <>
      <JsonLd
        data={[
          organizationSchema(company),
          breadcrumbSchema(trail),
          itemListSchema(posts, { name: 'Insights', path: (item) => `/blog/${item.slug}` }),
        ]}
        id="ld-blog"
      />

      <PageHeader
        eyebrow="Insights"
        title="Writing on digital work"
        description="Notes from the team on search, content, websites and running campaigns."
        breadcrumb={<Breadcrumbs trail={trail} />}
      />

      <Section className="pt-0">
        {/* Category filter, only when there is more than one. */}
        {taxonomy.categories.length > 1 ? (
          <nav aria-label="Filter articles by category" className="mb-8 flex flex-wrap gap-2">
            <FilterLink href="/blog" active={!category && !tag}>
              All
            </FilterLink>

            {taxonomy.categories.map((entry) => (
              <FilterLink key={entry.id} href={`/blog?category=${entry.slug}`} active={category === entry.slug}>
                {entry.name}
              </FilterLink>
            ))}
          </nav>
        ) : null}

        {posts.length ? (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, index) => (
                <PostCard key={post.slug} post={post} priority={index < 3} />
              ))}
            </div>

            <Pagination page={meta.page} totalPages={meta.totalPages} basePath={buildBase({ page: undefined })} />
          </>
        ) : (
          <EmptyState
            icon={Newspaper}
            title="No articles published yet"
            description="Published articles appear here. Drafts are never shown on the public site."
          />
        )}

        {/* Tags, below the list, so they never displace the primary filter. */}
        {taxonomy.tags.length ? (
          <div className="mt-16 border-t border-line pt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Browse by topic</h2>

            <ul className="mt-4 flex flex-wrap gap-2">
              {taxonomy.tags.slice(0, 24).map((entry) => (
                <li key={entry.id}>
                  <a
                    href={`/blog?tag=${entry.slug}`}
                    className={cn(
                      'inline-flex h-8 items-center rounded-md border px-3 text-sm',
                      tag === entry.slug
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-line text-ink-muted hover:border-brand-300 hover:text-brand-600',
                    )}
                  >
                    {entry.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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