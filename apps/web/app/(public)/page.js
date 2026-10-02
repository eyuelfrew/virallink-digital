import {
  fetchCompany,
  fetchServices,
  fetchFeaturedProjects,
  fetchTeam,
  fetchTestimonials,
  fetchPublicClients,
} from '@/lib/api';
import { buildMetadata, organizationSchema, websiteSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  Hero,
  Introduction,
  ServicesSection,
  FeaturedWork,
  ClientsSection,
  StatsSection,
  TestimonialsSection,
  TeamSection,
  ContactCta,
} from '@/components/site/home-sections';
import CameraStudio from '@/components/site/CameraStudio';

/**
 * Home page.
 *
 * Data is fetched in parallel — six independent calls, one round trip's worth of
 * latency rather than six.
 *
 * The page renders whatever exists. Every section below hides itself when its
 * data is empty, so a fresh install shows a clean, honest page rather than empty
 * headings and broken grids. There are no placeholder statistics, testimonials
 * or client logos anywhere in this file.
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
  const [company, services, projects, team, testimonials, clients] = await Promise.all([
    fetchCompany().catch(() => null),
    fetchServices().catch(() => []),
    fetchFeaturedProjects(4).catch(() => []),
    fetchTeam().catch(() => []),
    fetchTestimonials(3).catch(() => []),
    fetchPublicClients().catch(() => []),
  ]);

  // Statistics are attached to the company profile, so they cost no extra call.
  const stats = company?.stats || [];

  return (
    <>
      {/* Organization + LocalBusiness + WebSite. Only rendered where the data
          exists, so an uninstalled site emits nothing rather than a stub. */}
      <JsonLd data={[organizationSchema(company), websiteSchema()]} id="ld-home" />

      <Hero company={company} />

      <Introduction company={company} />

      <ServicesSection services={services} />

      <FeaturedWork projects={projects} />

      {/* Clients and testimonials render only when an administrator has published
          something, so no placeholder logos or invented quotes ever appear. */}
      <ClientsSection clients={clients} />

      <StatsSection stats={stats} />

      <TestimonialsSection testimonials={testimonials} />

      {/* The interactive photo booth. Always present: it is the one section
          that works from day one, before any content has been published. */}
      <CameraStudio />

      <TeamSection team={team} />

      <ContactCta company={company} />
    </>
  );
}