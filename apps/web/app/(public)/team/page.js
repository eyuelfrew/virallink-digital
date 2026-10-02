import { fetchTeam, fetchCompany } from '@/lib/api';
import { buildMetadata, breadcrumbSchema, organizationSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section } from '@/components/site/Section';
import { PageHeader } from '@/components/site/PageHeader';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { TeamMember, EmptyState } from '@/components/site/Card';
import { ContactCta } from '@/components/site/home-sections';
import { Users } from 'lucide-react';

/**
 * Team.
 *
 * Only employees an administrator has marked public appear. The public API
 * returns name, position, department, biography, photo and LinkedIn — no email,
 * phone, employment status or joining date, so those columns cannot leak through
 * this page even by mistake.
 */
export async function generateMetadata() {
  const company = await fetchCompany().catch(() => null);

  return buildMetadata({
    title: 'Our team',
    description: `Meet the people behind ${company?.name || 'Virallink'}.`,
    path: '/team',
  });
}

export default async function TeamPage() {
  const [team, company] = await Promise.all([
    fetchTeam().catch(() => []),
    fetchCompany().catch(() => null),
  ]);

  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Team', href: '/team' },
  ];

  // Group by department so the page reads as a team rather than a list. Employees
  // without a department are collected under "Other".
  const byDepartment = new Map();

  for (const member of team) {
    const key = member.department?.name || 'Other';
    if (!byDepartment.has(key)) byDepartment.set(key, []);
    byDepartment.get(key).push(member);
  }

  return (
    <>
      <JsonLd data={[organizationSchema(company), breadcrumbSchema(trail)]} id="ld-team" />

      <PageHeader
        eyebrow="Our people"
        title="The team"
        description="The people you will actually work with."
        breadcrumb={<Breadcrumbs trail={trail} />}
      />

      <Section className="pt-0">
        {team.length ? (
          <div className="flex flex-col gap-16">
            {[...byDepartment.entries()].map(([department, members]) => (
              <section key={department}>
                <h2 className="text-h3">{department}</h2>

                <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
                  {members.map((member) => (
                    <li key={member.name}>
                      <TeamMember member={member} />

                      {member.biography ? (
                        <p className="mt-3 text-sm leading-relaxed text-ink-muted">{member.biography}</p>
                      ) : null}

                      {member.linkedinUrl ? (
                        <a
                          href={member.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
                        >
                          LinkedIn
                          <span className="sr-only"> profile for {member.name}</span>
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No team members published yet"
            description="Team profiles appear here once an administrator adds them and marks them as public."
          />
        )}
      </Section>

      <ContactCta company={company} />
    </>
  );
}