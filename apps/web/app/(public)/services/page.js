import { notFound } from 'next/navigation';
import { fetchServices, fetchCompany } from '@/lib/api';
import { buildMetadata, organizationSchema, breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section } from '@/components/site/Section';
import { PageHeader } from '@/components/site/PageHeader';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { ServiceCard, EmptyState } from '@/components/site/Card';
import { ContactCta } from '@/components/site/home-sections';
import { Briefcase } from 'lucide-react';

/**
 * Services index.
 *
 * Entirely data-driven. An administrator publishing a service creates
 * /services/<slug> and it appears here and in the sitemap, with no code change
 * and no redeploy.
 */
export async function generateMetadata() {
  let company = null;
  try {
    company = await fetchCompany();
  } catch {
    company = null;
  }

  return buildMetadata({
    title: 'Services',
    description:
      company?.metaDescription ||
      'The services Virallink offers, from search and social through to web development and content.',
    path: '/services',
  });
}

export default async function ServicesPage() {
  const [services, company] = await Promise.all([
    fetchServices().catch(() => []),
    fetchCompany().catch(() => null),
  ]);

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Services', href: '/services' },
  ];

  return (
    <>
      <JsonLd data={[organizationSchema(company), breadcrumbSchema(trail)]} id="ld-services" />

      <PageHeader
        eyebrow="What we do"
        title="Services"
        description="Every engagement starts from the outcome you need. What follows is how we get there."
        breadcrumb={<Breadcrumbs trail={trail} />}
      />

      <Section className="pt-0">
        {services.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Briefcase}
            title="No services published yet"
            description="Once a service is published in the admin dashboard it will appear here with its own page."
          />
        )}
      </Section>

      <ContactCta company={company} />
    </>
  );
}

export { notFound };