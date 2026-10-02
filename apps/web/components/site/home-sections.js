import Image from 'next/image';
import Link from 'next/link';
import { BRAND } from '@/lib/config';
import { Section, SectionHeading } from './Section';
import { ProjectCard, ServiceCard, StatItem } from './Card';
import { TestimonialCard } from './TestimonialCard';
import { ArrowLink } from '@/components/ui/Button';
import { Reveal } from '@/components/motion/Reveal';
import CountUp from '@/components/motion/CountUp';
import { cn } from '@/lib/utils';

/**
 * Home page sections.
 *
 * Split into small Server Components so each fetches only what it needs and a
 * slow section does not hold up the rest of the page. Each hides itself when
 * there is nothing to show — an empty "Our clients" heading over an empty grid
 * looks like a bug, so the section is omitted entirely until an admin publishes
 * content.
 */

/**
 * Hero.
 *
 * The first thing a visitor sees, so it carries the whole positioning: what the
 * company does, for whom, and one action. Deliberately text-led — the mark of a
 * serious agency is typography and layout, not a stock hero photograph.
 */
export function Hero({ company }) {
  const heading = company?.metaTitle || company?.name || BRAND.name;
  const subheading =
    company?.shortDescription ||
    'Digital marketing, web and content services for businesses that want measurable growth.';

  return (
    <section className="relative overflow-hidden bg-surface-muted">
      {/* Backdrop: a faint blueprint grid plus two slowly drifting orbs. Both are
          aria-hidden decoration; the grid masks itself out towards the bottom so
          the band resolves into clean space before the next section. */}
      <div className="hero-grid absolute inset-0" aria-hidden="true" />
      <div
        className="orb left-[-10%] top-[-20%] size-[34rem] bg-brand-500/25"
        aria-hidden="true"
      />
      <div
        className="orb orb-slow bottom-[-30%] right-[-8%] size-[26rem] bg-accent-400/15"
        aria-hidden="true"
      />

      <div className="container-page relative py-20 lg:py-28">
        <div className="max-w-3xl">
          <Reveal delay={0}>
            <p className="mb-5 flex items-center gap-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-brand-600">
              <span className="accent-rule" aria-hidden="true" />
              {[company?.city, company?.country].filter(Boolean).join(', ') || 'Addis Ababa, Ethiopia'}
            </p>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="text-display">{heading}</h1>
          </Reveal>

          <Reveal delay={180}>
            <p className="mt-6 max-w-2xl text-lead text-ink-muted">{subheading}</p>
          </Reveal>

          <Reveal delay={270}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/contact"
                className={cn(
                  'btn-shine inline-flex h-12 items-center rounded-md bg-accent-400 px-6 text-base font-semibold text-brand-950',
                  'transition-colors hover:bg-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                )}
              >
                Start a project
              </Link>

              <Link
                href="/portfolio"
                className={cn(
                  'inline-flex h-12 items-center rounded-md border border-line-strong px-6 text-base font-semibold text-ink',
                  'transition-colors hover:border-brand-500 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                )}
              >
                See our work
              </Link>
            </div>
          </Reveal>

          <Reveal delay={380}>
            <p className="mt-10 flex items-center gap-2.5 text-sm text-ink-muted">
              <span className="pulse-dot inline-flex size-2 rounded-full bg-emerald-400" aria-hidden="true" />
              Taking on new projects for this quarter
            </p>
          </Reveal>
        </div>
      </div>

      {/* A single flat accent rule along the base rather than a gradient wash. */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-500" aria-hidden="true" />
    </section>
  );
}

/**
 * Introduction.
 *
 * Uses the admin-authored description if present, and otherwise a short
 * structural paragraph. No invented claims about years in business, client counts
 * or results — those are the numbers that get fabricated, so nothing appears here
 * that an administrator has not written.
 */
export function Introduction({ company }) {
  const body = company?.description || company?.shortDescription;

  if (!body) return null;

  return (
    <Section tone="light">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeading eyebrow="Who we are" title={company?.name || BRAND.name} />
        </div>

        <div className="lg:col-span-7">
          {/* Long-form admin content is prose, so it is measured and spaced as such. */}
          <div className="prose-content max-w-none">
            {splitParagraphs(body).map((paragraph, index) => (
              <p key={index} className={index === 0 ? 'mt-0 text-lead' : ''}>
                {paragraph}
              </p>
            ))}
          </div>

          <div className="mt-8">
            <ArrowLink href="/about">More about us</ArrowLink>
          </div>
        </div>
      </div>
    </Section>
  );
}

/** Core services. */
export function ServicesSection({ services }) {
  if (!services?.length) return null;

  return (
    <Section tone="muted">
      <Reveal>
        <SectionHeading
          eyebrow="What we do"
          title="Services built around outcomes, not deliverables"
          description="Each engagement starts with the result you need, then works out what it actually takes to get there."
        />
      </Reveal>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service, index) => (
          <Reveal key={service.slug} delay={(index % 3) * 90} direction="zoom">
            <ServiceCard service={service} />
          </Reveal>
        ))}
      </div>

      <Reveal delay={120}>
        <div className="mt-10">
          <ArrowLink href="/services">All services</ArrowLink>
        </div>
      </Reveal>
    </Section>
  );
}

/**
 * Selected work.
 *
 * Only published, featured projects appear. With none published, the section is
 * omitted rather than showing an empty grid.
 */
export function FeaturedWork({ projects }) {
  if (!projects?.length) return null;

  return (
    <Section tone="light">
      <Reveal>
        <SectionHeading
          eyebrow="Selected work"
          title="Projects we can talk about"
          description="A sample of recent engagements. Full case studies include the brief, the approach and the outcome."
        />
      </Reveal>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {projects.map((project, index) => (
          <Reveal key={project.slug} delay={(index % 4) * 90} direction="zoom">
            <ProjectCard project={project} priority={index < 2} />
          </Reveal>
        ))}
      </div>

      <Reveal delay={120}>
        <div className="mt-10">
          <ArrowLink href="/portfolio">View all case studies</ArrowLink>
        </div>
      </Reveal>
    </Section>
  );
}

/**
 * Clients.
 *
 * A continuously scrolling marquee rather than a static grid: it shows more
 * names in less space, and the slow drift draws the eye without shouting. The
 * list is rendered twice for a seamless loop; hovering pauses it.
 */
export function ClientsSection({ clients }) {
  if (!clients?.length) return null;

  const items = clients.slice(0, 12);
  const doubled = [...items, ...items];

  return (
    <Section tone="muted">
      <Reveal>
        <SectionHeading
          eyebrow="Who we work with"
          title="Trusted by businesses across Ethiopia"
          align="center"
        />
      </Reveal>

      <Reveal delay={100}>
        <div className="marquee marquee-mask mt-12 overflow-hidden border-y border-line py-8">
          <ul className="marquee-track items-center">
            {doubled.map((client, index) => (
              <li
                key={`${client.id || client.name}-${index}`}
                className="flex shrink-0 items-center justify-center px-10"
                aria-hidden={index >= items.length ? 'true' : undefined}
              >
                {client.logo?.url ? (
                  <Image
                    src={client.logo.url}
                    alt={index < items.length ? client.logo.altText || client.name : ''}
                    width={160}
                    height={48}
                    className="max-h-10 w-auto max-w-full object-contain opacity-60 grayscale transition-all duration-300 hover:scale-105 hover:opacity-100 hover:grayscale-0"
                  />
                ) : (
                  <span className="whitespace-nowrap text-center font-sans text-base font-semibold text-ink-subtle transition-colors hover:text-brand-600">
                    {client.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      <Reveal delay={150}>
        <div className="mt-8 text-center">
          <ArrowLink href="/clients">More about our clients</ArrowLink>
        </div>
      </Reveal>
    </Section>
  );
}

/**
 * Statistics.
 *
 * Rendered only from published admin-managed figures. When none exist the band is
 * skipped, because a plausible-looking number nobody verified is worse than no
 * number at all.
 */
export function StatsSection({ stats }) {
  if (!stats?.length) return null;

  return (
    <Section tone="light" size="tight">
      <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Reveal key={stat.label} delay={index * 100}>
            <StatItem stat={stat} animate />
          </Reveal>
        ))}
      </dl>
    </Section>
  );
}

/** Testimonials, when there are any. */
export function TestimonialsSection({ testimonials }) {
  if (!testimonials?.length) return null;

  return (
    <Section tone="muted">
      <Reveal>
        <SectionHeading
          eyebrow="In their words"
          title="What clients say"
          align="center"
        />
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {testimonials.map((testimonial, index) => (
          <Reveal key={testimonial.id || testimonial.authorName} delay={index * 100} direction="zoom">
            <TestimonialCard testimonial={testimonial} />
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/** Team preview, capped at four. */
export function TeamSection({ team }) {
  if (!team?.length) return null;

  const preview = team.slice(0, 4);

  return (
    <Section tone="muted">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <Reveal direction="left">
            <SectionHeading
              eyebrow="Our people"
              title="The team behind the work"
              description="Small enough to stay accountable, experienced enough to deliver."
            />

            <div className="mt-8">
              <ArrowLink href="/team">Meet the whole team</ArrowLink>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {preview.map((member, index) => (
              <Reveal key={member.name} delay={index * 80} direction="zoom">
                <div>
                  <div className="group relative aspect-[4/5] overflow-hidden rounded-lg bg-surface-sunken">
                    {member.photo?.url ? (
                      <Image
                        src={member.photo.url}
                        alt={member.photo.altText || member.name}
                        fill
                        sizes="(min-width: 1024px) 20vw, 45vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-brand-800 transition-colors duration-300 group-hover:bg-brand-700">
                        <span className="font-sans text-2xl font-bold text-white/80">
                          {member.name
                            .split(' ')
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join('')}
                        </span>
                      </div>
                    )}
                  </div>

                  <h3 className="mt-3 text-sm font-semibold">{member.name}</h3>
                  {member.position ? (
                    <p className="mt-0.5 text-sm text-ink-muted">{member.position}</p>
                  ) : null}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

/**
 * Closing call to action.
 *
 * Repeats the single primary action, which is the point of having exactly one.
 */
export function ContactCta({ company }) {
  return (
    <Section tone="light">
      <Reveal direction="zoom" className="mx-auto max-w-2xl text-center">
        <h2 className="text-h1">Tell us what you are trying to achieve</h2>

        <p className="mt-5 text-lead text-ink-muted">
          Send us a few lines about your project. We will come back with honest thoughts on scope, approach and
          whether we are the right fit.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/contact"
            className={cn(
              'btn-shine inline-flex h-12 items-center rounded-md bg-accent-400 px-6 text-base font-semibold text-brand-950',
              'transition-colors hover:bg-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
            )}
          >
            Start a project
          </Link>

          {company?.email ? (
            <a
              href={`mailto:${company.email}`}
              className="inline-flex h-12 items-center rounded-md border border-line-strong px-6 text-base font-semibold text-ink transition-colors hover:border-brand-500 hover:text-brand-600"
            >
              Email us
            </a>
          ) : null}
        </div>
      </Reveal>
    </Section>
  );
}

/** Split admin-authored prose into paragraphs for even spacing. */
function splitParagraphs(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export { splitParagraphs };