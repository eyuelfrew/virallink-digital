import { cn } from '@/lib/utils';

/**
 * Section shell.
 *
 * Every band on the page uses this, which is what keeps vertical rhythm and
 * gutters consistent without repeating container classes at each call site.
 *
 * `tone` picks the background. `dark` is used two or three times per page to
 * break up a long scroll — alternating light and dark is a deliberate device,
 * not decoration.
 */
export function Section({
  as: Tag = 'section',
  tone = 'light',
  size = 'default',
  container = true,
  id,
  className,
  children,
  ...props
}) {
  return (
    <Tag
      id={id}
      className={cn(
        size === 'default' ? 'section' : 'section-tight',
        tone === 'dark' && 'band-dark',
        tone === 'muted' && 'band-muted',
        tone === 'brand' && 'bg-brand-500 text-white',
        className,
      )}
      {...props}
    >
      {container ? <div className="container-page">{children}</div> : children}
    </Tag>
  );
}

/**
 * Section heading block.
 *
 * The eyebrow/accent-rule/heading/description pattern is repeated on most
 * sections, so it lives here rather than being retyped. The heading level is a
 * prop rather than fixed, which is what keeps the document outline correct
 * without an h1 appearing twice.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  headingLevel: Heading = 'h2',
  align = 'left',
  onDark = false,
  className,
  children,
}) {
  const centered = align === 'center';

  return (
    <div className={cn('max-w-2xl', centered && 'mx-auto text-center', className)}>
      {eyebrow ? (
        <p
          className={cn(
            'mb-3 flex items-center gap-2.5 text-sm font-semibold uppercase tracking-[0.12em]',
            onDark ? 'text-accent-400' : 'text-brand-500',
          )}
        >
          {centered ? (
            <span className="accent-rule mx-auto" aria-hidden="true" />
          ) : (
            <span className="accent-rule" aria-hidden="true" />
          )}
          {eyebrow}
        </p>
      ) : null}

      <Heading className={cn('text-h2', onDark && 'text-white')}>{title}</Heading>

      {description ? (
        <p className={cn('mt-4 text-lead text-ink-muted', onDark && 'text-white/70')}>
          {description}
        </p>
      ) : null}

      {children}
    </div>
  );
}

/**
 * Two-column text/visual split, collapsing to a single column below md.
 * Used on About, service detail and the contact page.
 */
export function Split({ children, reverse = false, ratio = '5/7', className }) {
  const isTextFirst = reverse ? ratio.endsWith('7') : ratio.startsWith('5');

  return (
    <div className={cn('grid items-center gap-10 md:grid-cols-12 md:gap-14', className)}>
      <div className={cn('md:col-span-5', !isTextFirst && 'md:order-2')}>{children[0]}</div>
      <div className={cn('md:col-span-7', isTextFirst && 'md:order-2')}>{children[1]}</div>
    </div>
  );
}

/** Small labelled detail used in a definition list. */
export function Detail({ label, value, className }) {
  if (!value) return null;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{label}</dt>
      <dd className="text-sm text-ink-soft">{value}</dd>
    </div>
  );
}