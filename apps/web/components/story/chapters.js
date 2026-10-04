import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Compass, Rocket, Sparkles, MoveDown } from 'lucide-react';
import { BRAND } from '@/lib/config';
import { cn } from '@/lib/utils';
import { ContactForm } from '@/components/site/ContactForm';

/**
 * Chapter content for the scroll story.
 *
 * These are Server Components: the home page renders them with real API data
 * and passes the finished HTML into ScrollStorySection, which positions them
 * over the 3D stage. Nothing here needs JavaScript — every headline, link,
 * list and form is crawlable, focusable markup that works with the 3D scene
 * disabled, with scripts disabled, and for screen readers.
 *
 * Copy policy matches the rest of the site: company name, description and
 * contact details come from the admin-managed company record, and nothing is
 * invented where that record is empty — empty states say so honestly.
 */

/* Chapter 1 — hero. The only h1 on the page lives here. */
export function StoryHero({ company }) {
  const heading = company?.metaTitle || company?.name || BRAND.name;
  const subheading =
    company?.shortDescription ||
    'Digital marketing, web and content services for businesses that want measurable growth.';
  const location = [company?.city, company?.country].filter(Boolean).join(', ');

  return (
    <div className="relative max-w-3xl">
      <div className="story-veil absolute -inset-x-10 -inset-y-14 -z-10" aria-hidden="true" />

      <p className="mb-5 flex items-center gap-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-accent-400">
        <span className="accent-rule" aria-hidden="true" />
        {location || 'Digital marketing studio'}
      </p>

      <h1 className="text-display text-white">{heading}</h1>

      <p className="mt-6 max-w-2xl text-lead text-white/70">{subheading}</p>

      <div className="mt-9 flex flex-wrap items-center gap-4">
        <Link
          href="/portfolio"
          className={cn(
            'btn-shine inline-flex h-12 items-center rounded-md bg-accent-400 px-6 text-base font-semibold text-brand-950',
            'transition-colors hover:bg-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400',
          )}
        >
          Explore our work
        </Link>

        <Link
          href="/contact"
          className={cn(
            'inline-flex h-12 items-center rounded-md border border-white/25 px-6 text-base font-semibold text-white',
            'transition-colors hover:border-accent-400 hover:text-accent-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400',
          )}
        >
          Start a project
        </Link>
      </div>

      <p className="mt-10 flex items-center gap-2.5 text-sm text-white/50">
        <MoveDown className="size-4 motion-safe:animate-bounce" aria-hidden="true" />
        Scroll to explore
      </p>
    </div>
  );
}

/* Chapter 2 — approach. Copy sits right of centre; the scene composition is left. */
export function StoryApproach({ company }) {
  const pillars = [
    {
      icon: Sparkles,
      title: 'Create',
      text: 'Ideas, identity and content shaped around the brand.',
    },
    {
      icon: Compass,
      title: 'Strategise',
      text: 'Research and planning that point every effort at a goal.',
    },
    {
      icon: Rocket,
      title: 'Execute',
      text: 'Campaigns, builds and launches, measured as they run.',
    },
  ];

  const body = company?.shortDescription || company?.description;

  return (
    <div className="relative ml-auto max-w-xl">
      <div className="story-veil-flip absolute -inset-x-10 -inset-y-14 -z-10" aria-hidden="true" />

      <p className="mb-5 flex items-center justify-end gap-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-accent-400">
        <span className="accent-rule" aria-hidden="true" />
        Chapter two
      </p>

      <h2 className="text-h2 text-white">Our approach</h2>

      {body ? <p className="mt-4 text-lead text-white/70">{body}</p> : null}

      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {pillars.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-lg border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <Icon className="size-5 text-accent-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-white/60">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Chapter 3 — services from the API, each one a real link to its detail page. */
export function StoryServices({ services = [] }) {
  return (
    <div className="relative max-w-2xl">
      <div className="story-veil absolute -inset-x-10 -inset-y-14 -z-10" aria-hidden="true" />

      <p className="mb-5 flex items-center gap-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-accent-400">
        <span className="accent-rule" aria-hidden="true" />
        What we do
      </p>

      <h2 className="text-h2 text-white">Services</h2>

      {services.length ? (
        <>
          <ul className="mt-7 grid gap-3 sm:grid-cols-2">
            {services.slice(0, 4).map((service) => (
              <li key={service.id ?? service.slug}>
                <Link
                  href={`/services/${service.slug}`}
                  className={cn(
                    'group flex items-center justify-between gap-3 rounded-md border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-sm',
                    'transition-colors hover:border-accent-400/60 hover:bg-white/10',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400',
                  )}
                >
                  <span className="text-sm font-semibold text-white">{service.title}</span>
                  <ArrowUpRight
                    className="size-4 shrink-0 text-accent-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/services"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-400 hover:text-accent-500"
          >
            All services
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </>
      ) : (
        <div className="mt-7 rounded-md border border-dashed border-white/20 px-6 py-8 text-center">
          <p className="text-sm text-white/70">
            Our service list is being prepared. Ask us directly about any project.
          </p>
          <Link
            href="/contact"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-400 hover:text-accent-500"
          >
            Start a conversation
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}

/* Chapter 4 — real, published projects, each linking to its detail page. */
export function StoryPortfolio({ projects = [] }) {
  return (
    <div className="relative ml-auto max-w-2xl">
      <div className="story-veil-flip absolute -inset-x-10 -inset-y-14 -z-10" aria-hidden="true" />

      <p className="mb-5 flex items-center justify-end gap-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-accent-400">
        <span className="accent-rule" aria-hidden="true" />
        Selected work
      </p>

      <h2 className="text-h2 text-white">Portfolio</h2>

      {projects.length ? (
        <>
          <ul className="mt-7 space-y-3">
            {projects.slice(0, 4).map((project) => (
              <li key={project.id ?? project.slug}>
                <Link
                  href={`/portfolio/${project.slug}`}
                  className={cn(
                    'group flex items-center gap-4 rounded-md border border-white/15 bg-white/5 p-3.5 backdrop-blur-sm',
                    'transition-colors hover:border-accent-400/60 hover:bg-white/10',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400',
                  )}
                >
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-brand-900">
                    {project.cover?.url ? (
                      <Image
                        src={project.cover.url}
                        alt={project.cover.altText || project.title}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <span
                        className="flex size-full items-center justify-center font-mono text-xs uppercase text-white/40"
                        aria-hidden="true"
                      >
                        {project.title?.slice(0, 2)}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {project.service?.title ? (
                      <p className="text-xs font-semibold uppercase tracking-wider text-accent-400">
                        {project.service.title}
                      </p>
                    ) : null}
                    <p className="truncate text-sm font-semibold text-white">{project.title}</p>
                    {project.summary ? (
                      <p className="mt-0.5 line-clamp-1 text-sm text-white/60">{project.summary}</p>
                    ) : null}
                  </div>

                  <ArrowUpRight
                    className="size-4 shrink-0 text-accent-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/portfolio"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-400 hover:text-accent-500"
          >
            View all projects
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-white/20 px-6 py-8 text-center">
          <p className="text-base font-semibold text-white">Case studies are on the way</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/60">
            We are publishing our project portfolio shortly. Until then, explore what we do or
            talk to us about yours.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/services"
              className="inline-flex h-10 items-center rounded-md border border-white/25 px-4 text-sm font-semibold text-white transition-colors hover:border-accent-400 hover:text-accent-400"
            >
              Explore services
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-10 items-center rounded-md bg-accent-400 px-4 text-sm font-semibold text-brand-950 transition-colors hover:bg-accent-500"
            >
              Start a project
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* Chapter 5 — conversion. Contact details from the company record plus the
   site's real contact form (the same one /contact uses). The form keeps its
   light surface so field styling stays consistent and legible. */
export function StoryContact({ company, services = [] }) {
  const email = company?.email;
  const phone = company?.phone;

  return (
    <div className="relative max-w-3xl">
      <div className="story-veil absolute -inset-x-10 -inset-y-14 -z-10" aria-hidden="true" />

      <p className="mb-5 flex items-center gap-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-accent-400">
        <span className="accent-rule" aria-hidden="true" />
        Start a project
      </p>

      <h2 className="text-h2 text-white">Let&rsquo;s make it travel</h2>

      {email || phone ? (
        <p className="mt-4 max-w-2xl text-lead text-white/70">
          Tell us what you are building —{' '}
          {email ? (
            <a
              href={`mailto:${email}`}
              className="font-semibold text-accent-400 underline-offset-4 hover:underline"
            >
              {email}
            </a>
          ) : null}
          {email && phone ? ' or ' : null}
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="font-semibold text-accent-400 underline-offset-4 hover:underline"
            >
              {phone}
            </a>
          ) : null}
          , or send the brief below.
        </p>
      ) : (
        <p className="mt-4 max-w-2xl text-lead text-white/70">
          Tell us what you are building, and we will take it from there.
        </p>
      )}

      <div className="mt-7 max-w-2xl rounded-lg border border-line bg-surface p-5 shadow-sm sm:p-7">
        <ContactForm services={services} />
      </div>
    </div>
  );
}
