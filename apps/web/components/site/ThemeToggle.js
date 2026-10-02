'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dark / light theme toggle.
 *
 * The theme is a `.dark` class on <html>, flipped here and persisted to
 * localStorage under `vl-theme`. A small inline script in the root layout
 * applies the stored preference before first paint, so there is no flash of the
 * wrong theme on load; this component only handles changes after that.
 *
 * While switching, a `theme-anim` class is put on <html> for the length of one
 * transition, giving a smooth crossfade without paying for a permanent
 * transition on every element.
 */

const STORAGE_KEY = 'vl-theme';

export function applyTheme(dark, animate = true) {
  const root = document.documentElement;

  if (animate) {
    root.classList.add('theme-anim');
    window.setTimeout(() => root.classList.remove('theme-anim'), 320);
  }

  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';

  try {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  } catch {
    /* Private browsing: the choice just will not persist. */
  }
}

export default function ThemeToggle({ className, variant = 'site' }) {
  // Server renders both icons in a neutral state; the real state is read in an
  // effect so hydration always matches the markup.
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    applyTheme(next);
  }

  const isSite = variant === 'site';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={mounted ? dark : undefined}
      title={dark ? 'Light theme' : 'Dark theme'}
      className={cn(
        'relative flex size-10 items-center justify-center overflow-hidden rounded-md border transition-colors',
        isSite
          ? 'border-line text-ink-soft hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600'
          : 'border-line text-ink-muted hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600',
        className,
      )}
    >
      {/* Both icons are always present; opacity and transform crossfade them so
          the swap reads as the sun setting and the moon rising. */}
      <Sun
        className={cn(
          'theme-icon absolute size-[1.05rem]',
          dark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100',
        )}
        aria-hidden="true"
      />
      <Moon
        className={cn(
          'theme-icon absolute size-[1.05rem]',
          dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0',
        )}
        aria-hidden="true"
      />
    </button>
  );
}
