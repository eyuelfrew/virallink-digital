import { fetchJobs, fetchCompany } from '@/lib/api';
import { buildMetadata, breadcrumbSchema, organizationSchema, itemListSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section } from '@/components/site/Section';
import { PageHeader } from '@/components/site/PageHeader';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { JobCard, EmptyState } from '@/components/site/Card';
import { ContactCta } from '@/components/site/home-sections';
import { BriefcaseBusiness } from 'lucide-react';

/**
 * Careers index.
 *
 * Roles are administrator-managed. A role whose closing date has passed is
 * automatically excluded by the API, so the list stays accurate without anyone
 * having to unpublish it.
 */
export async function generateMetadata() {
  const company = await fetchCompany().catch(() => null);

  return buildMetadata({
    title: 'Careers',
    description: `Open roles at ${company?.name || 'Virallink'}.`,
    path: '/careers',
  });
}

export default async function CareersPage() {
  const [jobs, company] = await Promise.all([
    fetchJobs().catch(() => []),
    fetchCompany().catch(() => null),
  ]);

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Careers', href: '/careers' },
  ];

  // Grouped by department where a role has one.
  const byDepartment = new Map();
  for (const job of jobs) {
    const key = job.department?.name || 'General';
    if (!byDepartment.has(key)) byDepartment.set(key, []);
    byDepartment.get(key).push(job);
  }

  return (
    <>
      <JsonLd
        data={[
          organizationSchema(company),
          breadcrumbSchema(trail),
          itemListSchema(jobs, { name: 'Open roles', path: (item) => `/careers/${item.slug}` }),
        ]}
        id="ld-careers"
      />

      <PageHeader
        eyebrow="Careers"
        title="Work with us"
        description="We hire for people who want ownership of real outcomes rather than a slice of one."
        breadcrumb={<Breadcrumbs trail={trail} />}
      />

      <Section className="pt-0">
        {jobs.length ? (
          <div className="flex flex-col gap-12">
            {[...byDepartment.entries()].map(([department, entries]) => (
              <section key={department}>
                <h2 className="text-h3">{department}</h2>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  {entries.map((job) => (
                    <JobCard key={job.slug} job={job} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BriefcaseBusiness}
            title="No open roles at the moment"
            description="New positions are posted here as they become available. You are welcome to get in touch speculatively."
          />
        )}
      </Section>

      <ContactCta company={company} />
    </>
  );
}