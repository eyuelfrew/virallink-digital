import { Section } from '@/components/site/Section';
import { cn } from '@/lib/utils';

/**
 * Page header.
 *
 * Shared by every interior page so the h1, eyebrow and description always sit in
 * the same place. The h1 is the page's own heading — there is exactly one per
 * page, which is what makes the heading outline valid.
 */
export function PageHeader({ eyebrow, title, description, tone = 'light', breadcrumb, children, className }) {
  const dark = tone === 'dark';

  return (
    <Section tone={tone} size="tight" className={cn('pb-0', className)}>
      <div className="max-w-3xl">
        {breadcrumb ? <div className="mb-6">{breadcrumb}</div> : null}

        {eyebrow ? (
          <p
            className={cn(
              'mb-3 flex items-center gap-2.5 text-sm font-semibold uppercase tracking-[0.12em]',
              dark ? 'text-accent-400' : 'text-brand-500',
            )}
          >
            <span className="accent-rule" aria-hidden="true" />
            {eyebrow}
          </p>
        ) : null}

        <h1 className={cn('text-h1', dark && 'text-white')}>{title}</h1>

        {description ? (
          <p className={cn('mt-5 text-lead', dark ? 'text-white/70' : 'text-ink-muted')}>{description}</p>
        ) : null}

        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </Section>
  );
}

/**
 * Page footer padding.
 *
 * Gives the last section consistent bottom space. Used instead of a wrapper div
 * at each call site.
 */
export function PageBody({ children, className }) {
  return <Section size="tight" className={cn('pt-0', className)}>{children}</Section>;
}

export default PageHeader;