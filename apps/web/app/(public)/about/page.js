import { fetchCompany } from '@/lib/api';
import { buildMetadata, breadcrumbSchema, organizationSchema, stripHtml } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section, SectionHeading } from '@/components/site/Section';
import { PageHeader } from '@/components/site/PageHeader';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { Detail } from '@/components/site/Section';
import { ContactCta } from '@/components/site/home-sections';

/**
 * About.
 *
 * Everything on this page is administrator-authored: the story, mission, vision
 * and values. The layout renders whatever exists and omits the rest, so the page
 * is never padded with invented copy about a founding story or a headcount.
 */
export async function generateMetadata() {
  const company = await fetchCompany().catch(() => null);

  return buildMetadata({
    title: 'About us',
    description:
      company?.shortDescription || `About ${company?.name || 'Virallink'}: who we are and how we work.`,
    path: '/about',
  });
}

export default async function AboutPage() {
  const company = await fetchCompany().catch(() => null);

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'About', href: '/about' },
  ];

  const story = stripHtml(company?.description);
  const storyParagraphs = story.split(/\n{2,}/).filter(Boolean);

  const values = (company?.values || '')
    .split(/\n+/)
    .map((value) => value.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);

  const founded = company?.foundedDate
    ? new Date(company.foundedDate).toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'UTC' })
    : null;

  return (
    <>
      <JsonLd data={[organizationSchema(company), breadcrumbSchema(trail)]} id="ld-about" />

      <PageHeader
        eyebrow="About us"
        title={company?.name || 'About Virallink'}
        description={company?.shortDescription || undefined}
        breadcrumb={<Breadcrumbs trail={trail} />}
      />

      {storyParagraphs.length ? (
        <Section>
          <div className="max-w-3xl">
            <div className="prose-content max-w-none">
              {storyParagraphs.map((paragraph, index) => (
                <p key={index} className={index === 0 ? 'mt-0 text-lead' : ''}>
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </Section>
      ) : null}

      {/* Mission, vision and values, each rendered only when written. */}
      {company?.mission || company?.vision || values.length ? (
        <Section tone="muted">
          <SectionHeading eyebrow="What drives us" title="Mission, vision and values" />

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            {company?.mission ? (
              <div className="rounded-lg border border-line bg-surface p-7">
                <h3 className="text-h4">Our mission</h3>
                <div className="prose-content mt-3 text-[0.9375rem]">
                  <p className="mt-0">{stripHtml(company.mission)}</p>
                </div>
              </div>
            ) : null}

            {company?.vision ? (
              <div className="rounded-lg border border-line bg-surface p-7">
                <h3 className="text-h4">Our vision</h3>
                <div className="prose-content mt-3 text-[0.9375rem]">
                  <p className="mt-0">{stripHtml(company.vision)}</p>
                </div>
              </div>
            ) : null}
          </div>

          {values.length ? (
            <div className="mt-10">
              <h3 className="text-h4">How we work</h3>

              {/* Values as a list, not cards: they are short principles, and a
                  wall of boxes would give each one more weight than it deserves. */}
              <ul className="mt-5 grid gap-x-10 gap-y-4 sm:grid-cols-2">
                {values.map((value) => (
                  <li key={value} className="flex gap-3">
                    <span className="accent-rule mt-2 shrink-0" aria-hidden="true" />
                    <span className="text-[0.9375rem] leading-relaxed text-ink-soft">{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* Company facts. Only the fields an administrator has filled in. */}
      {founded || company?.registrationNumber || company?.addressLine1 || company?.city ? (
        <Section>
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHeading eyebrow="Company details" title="Facts and registration" />
            </div>

            <div className="lg:col-span-7">
              <dl className="grid gap-6 sm:grid-cols-2">
                <Detail label="Legal name" value={company?.legalName} />
                <Detail label="Founded" value={founded} />
                <Detail label="Registration number" value={company?.registrationNumber} />

                <Detail
                  label="Address"
                  value={
                    [company?.addressLine1, company?.addressLine2, company?.city, company?.country]
                      .filter(Boolean)
                      .join(', ') || undefined
                  }
                />

                <Detail label="Telephone" value={company?.phone} />
                <Detail label="Email" value={company?.email} />
              </dl>
            </div>
          </div>
        </Section>
      ) : null}

      <ContactCta company={company} />
    </>
  );
}