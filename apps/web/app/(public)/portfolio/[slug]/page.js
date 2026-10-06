import { notFound } from 'next/navigation';
import Image from 'next/image';
import { fetchProject, fetchCompany, fetchPosts } from '@/lib/api';
import { buildMetadata, projectSchema, breadcrumbSchema, organizationSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section, SectionHeading, Detail } from '@/components/site/Section';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { PostCard } from '@/components/site/Card';
import { ArrowLink } from '@/components/ui/Button';
import { ContactCta } from '@/components/site/home-sections';
import { stripHtml } from '@/lib/seo';
import { formatDate } from '@/shared/format';

/**
 * Case study detail.
 *
 * Structured as a narrative rather than a spec sheet: the challenge, the
 * approach, then the outcome. That ordering matches how a prospective client
 * reads and gives each section a natural heading level.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;

  const project = await fetchProject(slug).catch(() => null);
  if (!project) {
    return buildMetadata({ title: 'Case study not found', path: `/portfolio/${slug}`, noindex: true });
  }

  return buildMetadata({
    title: project.metaTitle || project.title,
    description: project.metaDescription || project.summary || project.description,
    path: `/portfolio/${project.slug}`,
    image: project.cover?.url || null,
    type: 'article',
    publishedTime: project.publishedAt,
  });
}

export default async function ProjectPage({ params }) {
  const { slug } = await params;

  const [project, company, relatedPosts] = await Promise.all([
    fetchProject(slug).catch(() => null),
    fetchCompany().catch(() => null),
    fetchPosts({ pageSize: 3 }).catch(() => ({ posts: [] })),
  ]);

  // An unpublished or unknown slug is a genuine 404.
  if (!project) notFound();

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Case studies', href: '/portfolio' },
    { label: project.title, href: `/portfolio/${project.slug}` },
  ];

  const outcome = stripHtml(project.results);
  const outcomeParagraphs = outcome.split(/\n{2,}/).filter(Boolean);

  return (
    <>
      <JsonLd
        data={[organizationSchema(company), projectSchema(project, company), breadcrumbSchema(trail)]}
        id="ld-project"
      />

      <Section tone="dark" size="tight" className="pb-0">
        <div className="max-w-3xl">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-white/60">
            {project.service ? (
              <a href={`/services/${project.service.slug}`} className="text-accent-400 hover:underline">
                {project.service.title}
              </a>
            ) : null}
            {project.client ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{project.client.name}</span>
              </>
            ) : null}
          </div>

          <h1 className="mt-3 text-h1 text-white">{project.title}</h1>

          {project.summary ? <p className="mt-5 text-lead text-white/70">{project.summary}</p> : null}
        </div>
      </Section>

      {project.cover?.url ? (
        <Section size="tight" className="pb-0">
          <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-surface-sunken">
            <Image
              src={project.cover.url}
              alt={project.cover.altText || project.title}
              fill
              // The cover is the largest contentful paint on this page, so it is
              // the one image worth prioritising.
              priority
              sizes="(min-width: 1280px) 1200px, 100vw"
              className="object-cover"
            />
          </div>
        </Section>
      ) : null}

      <Section>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-8">
            {project.description ? (
              <div className="prose-content max-w-none">
                {stripHtml(project.description)
                  .split(/\n{2,}/)
                  .filter(Boolean)
                  .map((paragraph, index) => (
                    <p key={index} className={index === 0 ? 'mt-0' : ''}>
                      {paragraph}
                    </p>
                  ))}
              </div>
            ) : null}

            {project.challenge ? (
              <div className="mt-12">
                <h2 className="text-h3">The challenge</h2>
                <div className="prose-content mt-4 max-w-none">
                  {stripHtml(project.challenge)
                    .split(/\n{2,}/)
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={index} className={index === 0 ? 'mt-0' : ''}>
                        {paragraph}
                      </p>
                    ))}
                </div>
              </div>
            ) : null}

            {project.solution ? (
              <div className="mt-12">
                <h2 className="text-h3">What we did</h2>
                <div className="prose-content mt-4 max-w-none">
                  {stripHtml(project.solution)
                    .split(/\n{2,}/)
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={index} className={index === 0 ? 'mt-0' : ''}>
                        {paragraph}
                      </p>
                    ))}
                </div>
              </div>
            ) : null}

            {/* Outcome is visually separated because it is the part a
                prospective client is looking for. */}
            {outcomeParagraphs.length ? (
              <div className="mt-12 border-l-2 border-accent-400 pl-6">
                <h2 className="text-h3">The outcome</h2>
                <div className="prose-content mt-4 max-w-none">
                  {outcomeParagraphs.map((paragraph, index) => (
                    <p key={index} className={index === 0 ? 'mt-0' : ''}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Additional imagery, only if the project has any. */}
            {project.images?.length ? (
              <div className="mt-12 grid gap-4 sm:grid-cols-2">
                {project.images.map((image, index) => (
                  <figure key={index}>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-sunken">
                      <Image
                        src={image.media.url}
                        alt={image.media.altText || `${project.title} — image ${index + 1}`}
                        fill
                        sizes="(min-width: 1024px) 380px, 50vw"
                        className="object-cover"
                      />
                    </div>
                    {image.caption ? (
                      <figcaption className="mt-2 text-sm text-ink-muted">{image.caption}</figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            ) : null}
          </div>

          {/* Project facts. Rendered as a description list so the labels and
              values are programmatically associated. */}
          <aside className="lg:col-span-4">
            <div className="sticky top-24 rounded-lg border border-line bg-surface-muted p-6">
              <h2 className="text-h4">Project details</h2>

              <dl className="mt-5 flex flex-col gap-5">
                {project.client ? (
                  <Detail label="Client" value={project.client.name} />
                ) : null}

                {project.service ? (
                  <Detail
                    label="Service"
                    value={
                      <a href={`/services/${project.service.slug}`} className="text-brand-600 hover:underline">
                        {project.service.title}
                      </a>
                    }
                  />
                ) : null}

                {project.completedAt ? (
                  <Detail label="Completed" value={formatDate(project.completedAt)} />
                ) : null}

                {project.techStack?.length ? (
                  <Detail
                    label="Stack"
                    value={
                      <ul className="flex flex-wrap gap-1.5">
                        {project.techStack.map((technology) => (
                          <li
                            key={technology}
                            className="rounded-sm bg-surface-sunken px-2 py-0.5 font-mono text-xs"
                          >
                            {technology}
                          </li>
                        ))}
                      </ul>
                    }
                  />
                ) : null}

                {project.projectUrl ? (
                  <Detail
                    label="Visit"
                    value={
                      <a
                        href={project.projectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline"
                      >
                        Open the project
                      </a>
                    }
                  />
                ) : null}
              </dl>

              <div className="mt-6 border-t border-line pt-5">
                <ArrowLink href="/contact">Discuss a similar project</ArrowLink>
              </div>
            </div>
          </aside>
        </div>
      </Section>

      {relatedPosts?.posts?.length ? (
        <Section tone="muted">
          <SectionHeading eyebrow="From the blog" title="Related reading" />

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {relatedPosts.posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </Section>
      ) : null}

      <ContactCta company={company} />
    </>
  );
}