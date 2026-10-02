import { fetchCompany, fetchServices } from '@/lib/api';
import { buildMetadata, breadcrumbSchema, organizationSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section } from '@/components/site/Section';
import { PageHeader } from '@/components/site/PageHeader';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { Detail } from '@/components/site/Section';
import { ContactForm } from '@/components/site/ContactForm';

/**
 * Contact.
 *
 * The form posts to this app's own /api/contact route handler, which calls the
 * API server-side. That keeps the endpoint off the browser's cross-origin path
 * entirely and means the contact form works with no CORS negotiation.
 *
 * Contact details come from the database. Where an administrator has not entered
 * a phone number, the row is omitted rather than shown empty.
 */
export async function generateMetadata() {
  const company = await fetchCompany().catch(() => null);

  return buildMetadata({
    title: 'Contact us',
    description: `Start a project with ${company?.name || 'Virallink'}. Tell us what you are trying to achieve.`,
    path: '/contact',
  });
}

export default async function ContactPage() {
  const [company, services] = await Promise.all([
    fetchCompany().catch(() => null),
    // Only published services are offered as options, so the form cannot be used
    // to probe unpublished ones.
    fetchServices().catch(() => []),
  ]);

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Contact', href: '/contact' },
  ];

  const hasContactDetails =
    company?.phone || company?.email || company?.addressLine1 || company?.city;

  return (
    <>
      <JsonLd data={[organizationSchema(company), breadcrumbSchema(trail)]} id="ld-contact" />

      <PageHeader
        eyebrow="Get in touch"
        title="Start a project"
        description="Tell us a little about what you are trying to achieve. We will come back with honest thoughts on scope and whether we are the right fit."
        breadcrumb={<Breadcrumbs trail={trail} />}
      />

      <Section className="pt-0">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <ContactForm services={services} />
          </div>

          <aside className="lg:col-span-5">
            {hasContactDetails ? (
              <div className="rounded-lg border border-line bg-surface-muted p-7">
                <h2 className="text-h4">Other ways to reach us</h2>

                <dl className="mt-5 flex flex-col gap-5">
                  {company?.phone ? (
                    <Detail
                      label="Phone"
                      value={
                        <a
                          href={`tel:${company.phone.replace(/[^+\d]/g, '')}`}
                          className="font-mono text-brand-600 hover:underline"
                        >
                          {company.phone}
                        </a>
                      }
                    />
                  ) : null}

                  {company?.email ? (
                    <Detail
                      label="Email"
                      value={
                        <a href={`mailto:${company.email}`} className="break-all text-brand-600 hover:underline">
                          {company.email}
                        </a>
                      }
                    />
                  ) : null}

                  {company?.addressLine1 || company?.city ? (
                    <Detail
                      label="Office"
                      value={
                        <address className="not-italic leading-relaxed">
                          {[company.addressLine1, company.addressLine2, company.city, company.country]
                            .filter(Boolean)
                            .join(', ')}
                        </address>
                      }
                    />
                  ) : null}

                  {company?.openingHours ? (
                    <Detail
                      label="Hours"
                      value={
                        company.openingHours.match(/^([a-z]{3,9})\s*-\s*([a-z]{3,9})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i)
                          ? // "Mon-Fri 09:00-17:00" reads better as words.
                            `${company.openingHours.replace(/(\d{2}):(\d{2})/g, (_, h, m) => `${h}:${m}`)}`
                          : company.openingHours
                      }
                    />
                  ) : null}
                </dl>
              </div>
            ) : null}

            {company?.socialLinks?.length ? (
              <div className="mt-8 rounded-lg border border-line bg-surface-muted p-7">
                <h2 className="text-h4">Follow us</h2>
                <ul className="mt-4 flex flex-wrap gap-4">
                  {company.socialLinks.map((link) => (
                    <li key={link.platform}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
                      >
                        {link.label || link.platform}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </Section>
    </>
  );
}