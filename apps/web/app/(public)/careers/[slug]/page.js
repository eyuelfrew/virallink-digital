import { notFound } from 'next/navigation';
import { fetchJob, fetchCompany } from '@/lib/api';
import { buildMetadata, jobSchema, breadcrumbSchema, organizationSchema, stripHtml } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section, Detail } from '@/components/site/Section';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { ButtonLink } from '@/components/ui/Button';
import { ContactCta } from '@/components/site/home-sections';
import { sanitizeArticleHtml } from '@/lib/sanitize';
import { formatDate } from '@/shared/format';

/**
 * Job detail.
 *
 * Carries JobPosting structured data, which is what makes a role eligible for
 * Google's job listings. Every field that schema requires is present.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;

  const job = await fetchJob(slug).catch(() => null);
  if (!job) {
    return buildMetadata({ title: 'Role not found', path: `/careers/${slug}`, noindex: true });
  }

  return buildMetadata({
    title: `${job.title}${job.department?.name ? ` — ${job.department.name}` : ''}`,
    description: job.summary || `${job.title} at Virallink.${job.location ? ` Based in ${job.location}.` : ''}`,
    path: `/careers/${job.slug}`,
  });
}

export default async function JobPage({ params }) {
  const { slug } = await params;

  const [job, company] = await Promise.all([
    fetchJob(slug).catch(() => null),
    fetchCompany().catch(() => null),
  ]);

  if (!job) notFound();

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Careers', href: '/careers' },
    { label: job.title, href: `/careers/${job.slug}` },
  ];

  const descriptionParagraphs = stripHtml(job.description).split(/\n{2,}/).filter(Boolean);
  const requirements = sanitizeArticleHtml(job.requirements, 'html');

  return (
    <>
      <JsonLd data={[organizationSchema(company), jobSchema(job, company), breadcrumbSchema(trail)]} id="ld-job" />

      <Section tone="dark" size="tight" className="pb-0">
        <div className="max-w-3xl">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />

          <h1 className="text-h1 text-white">{job.title}</h1>

          {job.summary ? <p className="mt-5 text-lead text-white/70">{job.summary}</p> : null}
        </div>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-8">
            {descriptionParagraphs.length ? (
              <div className="prose-content max-w-none">
                {descriptionParagraphs.map((paragraph, index) => (
                  <p key={index} className={index === 0 ? 'mt-0' : ''}>
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}

            {requirements ? (
              <div className="mt-12">
                <h2 className="text-h3">What you will need</h2>
                <div className="prose-content mt-4 max-w-none" dangerouslySetInnerHTML={{ __html: requirements }} />
              </div>
            ) : null}
          </div>

          <aside className="lg:col-span-4">
            <div className="sticky top-24 rounded-lg border border-line bg-surface-muted p-6">
              <h2 className="text-h4">Role details</h2>

              <dl className="mt-5 flex flex-col gap-5">
                {job.department?.name ? <Detail label="Department" value={job.department.name} /> : null}
                {job.employmentType ? <Detail label="Type" value={job.employmentType} /> : null}

                <Detail
                  label="Location"
                  value={[job.location, job.isRemote ? 'Remote' : null].filter(Boolean).join(' or ') || undefined}
                />

                {job.closesAt ? (
                  <Detail label="Closes" value={formatDate(job.closesAt)} />
                ) : null}
              </dl>

              <div className="mt-6 border-t border-line pt-5">
                {job.applyUrl ? (
                  <ButtonLink href={job.applyUrl} variant="primary" size="md" className="w-full">
                    Apply for this role
                  </ButtonLink>
                ) : job.applyEmail ? (
                  <ButtonLink href={`mailto:${job.applyEmail}?subject=${encodeURIComponent(`Application: ${job.title}`)}`}>
                    Apply by email
                  </ButtonLink>
                ) : (
                  <ButtonLink href="/contact" className="w-full">
                    Get in touch
                  </ButtonLink>
                )}

                <p className="mt-4 text-xs text-ink-subtle">
                  {job.applyUrl
                    ? 'You will be taken to an external application form.'
                    : job.applyEmail
                      ? `Send your CV to ${job.applyEmail}.`
                      : 'Send us a message and we will point you to the right person.'}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </Section>

      <ContactCta company={company} />
    </>
  );
}