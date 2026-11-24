import { fetchCompany, fetchPublicClients } from '@/lib/api';
import { buildMetadata, breadcrumbSchema, organizationSchema, itemListSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section } from '@/components/site/Section';
import { PageHeader } from '@/components/site/PageHeader';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { ClientLogo, EmptyState } from '@/components/site/Card';
import { ContactCta } from '@/components/site/home-sections';
import { Building2 } from 'lucide-react';

/**
 * Clients.
 *
 * Shows only clients an administrator has explicitly opted in, and only the
 * display name, industry, website and logo. Contact details, contract values and
 * internal notes never reach this page — the public API does not return them, so
 * there is nothing here to filter out client-side.
 *
 * The page renders an explanatory empty state until entries exist, rather than
 * placeholder logos.
 */
export async function generateMetadata() {
  const company = await fetchCompany().catch(() => null);

  return buildMetadata({
    title: 'Our clients',
    description:
      company?.shortDescription ||
      'Businesses that have chosen Virallink for their digital marketing, web and content work.',
    path: '/clients',
  });
}

export default async function ClientsPage() {
  const [clients, company] = await Promise.all([
    fetchPublicClients().catch(() => []),
    fetchCompany().catch(() => null),
  ]);

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Clients', href: '/clients' },
  ];

  return (
    <>
      <JsonLd
        data={[
          organizationSchema(company),
          breadcrumbSchema(trail),
          itemListSchema(clients, { name: 'Our clients', path: () => '/clients' }),
        ]}
        id="ld-clients"
      />

      <PageHeader
        eyebrow="Who we work with"
        title="Our clients"
        description="Organisations that have trusted us with their digital presence."
        breadcrumb={<Breadcrumbs trail={trail} />}
      />

      <Section className="pt-0">
        {clients.length ? (
          <>
            {/* A bordered grid rather than a marquee: a logo wall that scrolls
                automatically is harder to read and harder to click. */}
            <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-4">
              {clients.map((client) => (
                <li key={client.id || client.name} className="bg-surface">
                  <ClientLogo client={client} className="h-28" />

                  {/* The name is written under every tile, logo or not: a client
                      published without a logo shows a monogram, and the monogram
                      alone would not say who it is. */}
                  <div className="px-4 pb-4 text-center">
                    <p className="text-sm font-semibold text-ink">{client.name}</p>
                    {client.industry ? (
                      <p className="mt-0.5 text-xs text-ink-subtle">{client.industry}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-sm text-ink-muted">
              Logos and client names are published only with each client&rsquo;s agreement.
            </p>
          </>
        ) : (
          <EmptyState
            icon={Building2}
            title="No clients published yet"
            description="Client names and logos appear here once they have been added and marked as publishable in the admin dashboard."
          />
        )}
      </Section>

      <ContactCta company={company} />
    </>
  );
}