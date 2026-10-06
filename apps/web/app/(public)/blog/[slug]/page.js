import { notFound } from 'next/navigation';
import Image from 'next/image';
import { fetchPost, fetchPosts, fetchCompany } from '@/lib/api';
import { buildMetadata, articleSchema, breadcrumbSchema, organizationSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section } from '@/components/site/Section';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { PostCard } from '@/components/site/Card';
import { ContactCta } from '@/components/site/home-sections';
import { formatDate } from '@/shared/format';
import { sanitizeArticleHtml } from '@/lib/sanitize';

/**
 * Article.
 *
 * A draft or unknown slug returns a real 404, so drafts cannot be discovered by
 * guessing URLs.
 *
 * The body is administrator-authored HTML and is sanitised before rendering.
 * Sanitising here as well as in the content layer means a stored payload cannot
 * reach any future consumer of this endpoint.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;

  const post = await fetchPost(slug).catch(() => null);
  if (!post) {
    return buildMetadata({ title: 'Article not found', path: `/blog/${slug}`, noindex: true });
  }

  return buildMetadata({
    title: post.metaTitle || post.title,
    description: post.metaDescription || post.excerpt,
    path: `/blog/${post.slug}`,
    image: post.featuredImage?.url || null,
    type: 'article',
    publishedTime: post.publishedAt,
    authors: post.author?.name ? [post.author.name] : null,
  });
}

export default async function PostPage({ params }) {
  const { slug } = await params;

  const [post, company, recent] = await Promise.all([
    fetchPost(slug).catch(() => null),
    fetchCompany().catch(() => null),
    fetchPosts({ pageSize: 4 }).catch(() => ({ posts: [] })),
  ]);

  if (!post) notFound();

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Insights', href: '/blog' },
    { label: post.title, href: `/blog/${post.slug}` },
  ];

  const related = (recent?.posts || []).filter((entry) => entry.slug !== post.slug).slice(0, 3);

  // Reading time from the sanitised text, so tags do not inflate the estimate.
  const wordCount = sanitizeArticleHtml(post.content, 'text').split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(wordCount / 220));

  return (
    <>
      <JsonLd
        data={[organizationSchema(company), articleSchema(post, company), breadcrumbSchema(trail)]}
        id="ld-article"
      />

      <Section tone="dark" size="tight" className="pb-0">
        <div className="mx-auto max-w-3xl">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />

          {post.categories?.length ? (
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-accent-400">
              {post.categories[0].name}
            </p>
          ) : null}

          <h1 className="text-h1 text-white">{post.title}</h1>

          {post.excerpt ? <p className="mt-5 text-lead text-white/70">{post.excerpt}</p> : null}

          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/60">
            {post.author?.name ? <span>By {post.author.name}</span> : null}

            {post.publishedAt ? (
              <time dateTime={post.publishedAt}>
                {formatDate(post.publishedAt)}
              </time>
            ) : null}

            <span aria-hidden="true">·</span>
            <span>{readingMinutes} min read</span>
          </div>
        </div>
      </Section>

      {post.featuredImage?.url ? (
        <Section size="tight" className="pb-0">
          <div className="mx-auto max-w-4xl">
            <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-surface-sunken">
              <Image
                src={post.featuredImage.url}
                alt={post.featuredImage.altText || post.title}
                fill
                priority
                sizes="(min-width: 1024px) 896px, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </Section>
      ) : null}

      <Section>
        <div className="mx-auto max-w-3xl">
          {/*
            dangerouslySetInnerHTML is unavoidable: post bodies are rich text
            authored by an administrator in the CMS. The content is sanitised
            first, so only a safe subset of tags and attributes can reach the DOM.
          */}
          <div
            className="prose-content"
            dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(post.content, 'html') }}
          />

          {post.tags?.length ? (
            <footer className="mt-12 border-t border-line pt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Topics</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <li key={tag.id || tag.slug}>
                    <a
                      href={`/blog?tag=${tag.slug}`}
                      className="inline-flex h-8 items-center rounded-md border border-line px-3 text-sm text-ink-muted hover:border-brand-300 hover:text-brand-600"
                    >
                      {tag.name}
                    </a>
                  </li>
                ))}
              </ul>
            </footer>
          ) : null}
        </div>
      </Section>

      {related.length ? (
        <Section tone="muted">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-h3">Keep reading</h2>

            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {related.map((entry) => (
                <PostCard key={entry.slug} post={entry} />
              ))}
            </div>
          </div>
        </Section>
      ) : null}

      <ContactCta company={company} />
    </>
  );
}