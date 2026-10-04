import {
  fetchCompany,
  fetchServices,
  fetchProjects,
  fetchTeam,
  fetchTestimonials,
  fetchPublicClients,
} from '@/lib/api';
import { buildMetadata, organizationSchema, websiteSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  ClientsSection,
  StatsSection,
  TestimonialsSection,
  TeamSection,
} from '@/components/site/home-sections';
import CameraStudio from '@/components/site/CameraStudio';
import ScrollStorySection from '@/components/story/ScrollStorySection';
import {
  StoryHero,
  StoryApproach,
  StoryServices,
  StoryPortfolio,
  StoryContact,
} from '@/components/story/chapters';

/**
 * Home page.
 *
 * The opening of the page is the scroll story: five chapters over a 3D scene,
 * with every chapter's content rendered as server-side HTML (SEO, keyboard and
 * no-WebGL paths all read the same markup). Data arrives through the same
 * public fetchers the rest of the site uses.
 *
 * After the story, the page returns to the standard light sections, which
 * still hide themselves when their data is empty.
 */
export async function generateMetadata() {
  let company = null;

  try {
    company = await fetchCompany();
  } catch {
    company = null;
  }

  return buildMetadata({
    title: company?.metaTitle || company?.name || 'Virallink',
    description:
      company?.metaDescription ||
      company?.shortDescription ||
      'Digital marketing, web development and content services from Virallink.',
    path: '/',
  });
}

export default async function HomePage() {
  const [company, services, latest, team, testimonials, clients] = await Promise.all([
    fetchCompany().catch(() => null),
    fetchServices().catch(() => []),
    // Any published project can appear in the story; featured ones lead.
    fetchProjects({ page: 1, pageSize: 4 }).catch(() => ({ projects: [] })),
    fetchTeam().catch(() => []),
    fetchTestimonials(3).catch(() => []),
    fetchPublicClients().catch(() => []),
  ]);

  // Featured projects first, then the rest by recency.
  const projects = [
    ...latest.projects.filter((project) => project.isFeatured),
    ...latest.projects.filter((project) => !project.isFeatured),
  ].slice(0, 4);

  // Statistics are attached to the company profile, so they cost no extra call.
  const stats = company?.stats || [];

  const chapters = [
    { label: 'Introduction', node: <StoryHero company={company} /> },
    { label: 'Our approach', node: <StoryApproach company={company} /> },
    { label: 'Services', node: <StoryServices services={services} /> },
    { label: 'Selected work', node: <StoryPortfolio projects={projects} /> },
    { label: 'Contact', node: <StoryContact company={company} services={services} /> },
  ];

  return (
    <>
      {/* Organization + LocalBusiness + WebSite. Only rendered where the data
          exists, so an uninstalled site emits nothing rather than a stub. */}
      <JsonLd data={[organizationSchema(company), websiteSchema()]} id="ld-home" />

      {/* Chapters 1–5: hero → approach → services → portfolio → contact.
          The canvas is lazy and optional; this markup is not. */}
      <ScrollStorySection chapters={chapters} sectionId="story" />

      {/* Clients and testimonials render only when an administrator has published
          something, so no placeholder logos or invented quotes ever appear. */}
      <ClientsSection clients={clients} />

      <StatsSection stats={stats} />

      <TestimonialsSection testimonials={testimonials} />

      {/* The interactive photo booth. Always present: it is the one section
          that works from day one, before any content has been published. */}
      <CameraStudio />

      <TeamSection team={team} />
    </>
  );
}
