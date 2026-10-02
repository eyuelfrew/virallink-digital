import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';
import CountUp from '@/components/motion/CountUp';

/**
 * Content cards.
 *
 * Three rules the whole site follows, so they are enforced here rather than
 * repeated:
 *  - not every section is a card. Cards are for repeated, comparable items:
 *    services, case studies, posts, roles.
 *  - cards are flat, with a hairline border rather than a drop shadow.
 *  - the whole card is one link, with a single focusable element, so there is
 *    exactly one tab stop and one accessible name per card.
 */

const cardSurface = [
  'group relative flex flex-col',
  'rounded-lg border border-line bg-surface card-lift',
  'transition-colors duration-150',
  'hover:border-brand-300',
];

/** Service card: icon, title, summary. */
export function ServiceCard({ service, className }) {
  return (
    <article className={cn(cardSurface, className)}>
      <Link href={`/services/${service.slug}`} className="flex h-full flex-col p-6 focus-visible:outline-none">
        <h3 className="text-h4 group-hover:text-brand-600">{service.title}</h3>

        {service.summary ? (
          <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-muted">{service.summary}</p>
        ) : null}

        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
          Learn more
          <ArrowUpRight
            className="size-4 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </Link>
    </article>
  );
}

/**
 * Case study card.
 *
 * The image is rendered with explicit dimensions from the media record so the
 * browser reserves space before it loads. That reserved space is what keeps
 * cumulative layout shift near zero as the grid settles.
 */
export function ProjectCard({ project, className, priority = false }) {
  const cover = project.cover;

  return (
    <article className={cn(cardSurface, className)}>
      <Link
        href={`/portfolio/${project.slug}`}
        className="flex h-full flex-col focus-visible:outline-none"
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg bg-surface-sunken">
          {cover?.url ? (
            <Image
              src={cover.url}
              // Alt text comes from the media record; the title is the fallback so
              // the image is never unlabelled.
              alt={cover.altText || project.title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              priority={priority}
            />
          ) : (
            // No cover image yet: a labelled placeholder rather than a blank box.
            <div className="flex size-full items-center justify-center bg-surface-sunken p-6">
              <span className="text-center text-sm text-ink-subtle">{project.title}</span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-5">
          {project.service ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">
              {project.service.title}
            </p>
          ) : null}

          <h3 className="mt-1.5 text-h4 group-hover:text-brand-600">{project.title}</h3>

          {project.client ? (
            <p className="mt-1 text-sm text-ink-subtle">{project.client.name}</p>
          ) : null}

          {project.summary ? (
            <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-ink-muted">
              {project.summary}
            </p>
          ) : null}

          {project.technologies?.length ? (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {project.technologies.slice(0, 4).map((technology) => (
                <li
                  key={technology}
                  className="rounded-sm bg-surface-sunken px-2 py-0.5 font-mono text-xs text-ink-muted"
                >
                  {technology}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

/** Blog post card. */
export function PostCard({ post, className, priority = false }) {
  return (
    <article className={cn(cardSurface, className)}>
      <Link href={`/blog/${post.slug}`} className="flex h-full flex-col focus-visible:outline-none">
        {post.featuredImage?.url ? (
          <div className="relative aspect-[16/9] overflow-hidden rounded-t-lg bg-surface-sunken">
            <Image
              src={post.featuredImage.url}
              alt={post.featuredImage.altText || post.title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              priority={priority}
            />
          </div>
        ) : null}

        <div className="flex flex-1 flex-col p-5">
          {post.publishedAt ? (
            <time
              dateTime={post.publishedAt}
              className="font-mono text-xs uppercase tracking-wider text-ink-subtle"
            >
              {new Date(post.publishedAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </time>
          ) : null}

          <h3 className="mt-2 text-h4 group-hover:text-brand-600">{post.title}</h3>

          {post.excerpt ? (
            <p className="mt-2.5 line-clamp-3 flex-1 text-sm leading-relaxed text-ink-muted">
              {post.excerpt}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

/**
 * Team member.
 *
 * A figure rather than a card: no border, because a wall of bordered boxes for
 * people reads as a grid of stock photos. The photo carries the layout.
 */
export function TeamMember({ member, className }) {
  const photo = member.photo;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-surface-sunken">
        {photo?.url ? (
          <Image
            src={photo.url}
            alt={photo.altText || member.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          // No photo yet. A neutral placeholder with the person's initials, which
          // looks deliberate rather than broken.
          <div className="flex size-full items-center justify-center bg-brand-800">
            <span className="font-sans text-3xl font-bold text-white/80">
              {member.name
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-h4">{member.name}</h3>
        {member.position ? (
          <p className="mt-0.5 text-sm font-medium text-brand-600">{member.position}</p>
        ) : null}
        {member.department?.name ? (
          <p className="mt-1 text-sm text-ink-subtle">{member.department.name}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Company statistic.
 *
 * Deliberately not a card. A row of figures separated by rules reads as data;
 * the same figures in boxes read as decoration. `animate` opts into the
 * count-up, which the home page uses inside the brand band.
 */
export function StatItem({ stat, className, animate = false }) {
  return (
    <div className={cn('flex flex-col', className)}>
      <span className="font-mono text-3xl font-bold tracking-tight text-brand-500 sm:text-4xl">
        {animate ? <CountUp value={stat.value} /> : stat.value}
      </span>
      <span className="mt-1.5 text-sm font-medium text-ink-soft">{stat.label}</span>
      {stat.description ? (
        <span className="mt-1 text-sm text-ink-muted">{stat.description}</span>
      ) : null}
    </div>
  );
}

/** Client logo. */
export function ClientLogo({ client, className }) {
  const logo = client.logo;

  if (logo?.url) {
    return (
      <div
        className={cn(
          'flex h-20 items-center justify-center px-6 grayscale transition-all duration-200',
          'hover:grayscale-0',
          className,
        )}
      >
        <Image
          src={logo.url}
          alt={logo.altText || client.name}
          width={160}
          height={48}
          className="max-h-12 w-auto max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-20 items-center justify-center px-6 text-center font-sans text-base font-semibold text-ink-muted',
        className,
      )}
    >
      {client.name}
    </div>
  );
}

/** Job listing. */
export function JobCard({ job, className }) {
  return (
    <article className={cn(cardSurface, className)}>
      <Link href={`/careers/${job.slug}`} className="flex flex-col p-6 focus-visible:outline-none">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-subtle">
          {job.department?.name ? <span>{job.department.name}</span> : null}
          {job.location ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{job.location}</span>
            </>
          ) : null}
          {job.isRemote ? (
            <>
              <span aria-hidden="true">·</span>
              <span>Remote</span>
            </>
          ) : null}
        </div>

        <h3 className="mt-2 text-h4 group-hover:text-brand-600">{job.title}</h3>

        {job.summary ? (
          <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-muted">{job.summary}</p>
        ) : null}

        {job.employmentType ? (
          <p className="mt-4 font-mono text-xs uppercase tracking-wider text-brand-600">
            {job.employmentType}
          </p>
        ) : null}
      </Link>
    </article>
  );
}

/**
 * Empty state.
 *
 * Every list on the site has one. An empty section that renders nothing looks
 * broken; an empty state explains what belongs there and how to add it.
 */
export function EmptyState({ title, description, action, icon: Icon, className, tone = 'light' }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-14 text-center',
        tone === 'dark' && 'border-white/20',
        className,
      )}
    >
      {Icon ? <Icon className={cn('size-8 text-ink-subtle', tone === 'dark' && 'text-white/40')} aria-hidden="true" /> : null}

      <p className="mt-4 text-base font-semibold text-ink-soft">{title}</p>

      {description ? (
        <p className={cn('mt-2 max-w-md text-sm text-ink-muted', tone === 'dark' && 'text-white/60')}>
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}