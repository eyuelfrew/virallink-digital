import Link from 'next/link';
import { cn } from '@/lib/utils';
import { cva } from 'class-variance-authority';
import { ArrowRight } from 'lucide-react';

/**
 * Button and link styles.
 *
 * One set of variants used by both `<button>` and `<Link>`, so a call to action
 * looks identical whether it navigates or submits. Restrained radii and a single
 * gold accent option, per the design direction.
 */

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 font-semibold',
    'rounded-md transition-colors duration-150',
    'disabled:pointer-events-none disabled:opacity-50',
    // Keyboard focus is handled globally in globals.css; this keeps it visible
    // on the dark band too.
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
  ],
  {
    variants: {
      variant: {
        // Primary action: the brand blue.
        primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
        // Secondary: an outline that reads as a peer to the primary.
        secondary:
          'border border-line-strong bg-surface text-ink hover:border-brand-500 hover:text-brand-600 active:bg-brand-50',
        // The single gold accent allowed per viewport. The text stays a fixed
        // dark navy rather than `text-ink`, which flips near-white in dark mode
        // and disappears against the gold.
        accent: 'bg-accent-400 text-brand-950 hover:bg-accent-500 active:bg-accent-600',
        // On dark bands, where a blue button would disappear.
        onDark: 'border border-white/25 text-white hover:bg-white hover:text-brand-900',
        // Low emphasis: a text link that still reads as actionable.
        ghost: 'text-brand-600 hover:text-brand-700 hover:bg-brand-50',
        // Destructive actions, always paired with a confirmation dialog.
        danger: 'bg-danger text-white hover:brightness-95 active:brightness-90',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-11 px-5 text-[0.9375rem]',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export { buttonVariants };

/** A button that performs an action. */
export function Button({ asChild = false, variant, size, className, children, ...props }) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Link className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}

/**
 * The primary call to action: label plus arrow. The arrow nudges on hover only,
 * which signals direction without a looping animation.
 */
export function ButtonLink({ href, children, variant = 'primary', size = 'md', className, ...props }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
      <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/** A text link with an arrow that appears on hover. */
export function ArrowLink({ href, children, className }) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex items-center gap-1.5 font-semibold text-brand-600',
        'hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500',
        className,
      )}
    >
      {children}
      <ArrowRight
        className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}