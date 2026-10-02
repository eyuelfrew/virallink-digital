'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ADMIN_NAV } from '@virallink/shared/permissions';
import { ADMIN_PATH } from '@/lib/config';
import {
  LayoutDashboard, FileStack, Users, Wallet, Settings, Menu, X, LogOut, ChevronDown,
  Briefcase, FolderKanban, Newspaper, Inbox, UserRound, Building2, PieChart,
  ArrowLeftRight, ReceiptText, ChartColumn, Building, Image, ShieldCheck, History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import BrandMark from '@/components/brand/BrandLogo';
import ThemeToggle from '@/components/site/ThemeToggle';

/** Map icon names from the shared nav config to components. */
const ICONS = {
  LayoutDashboard, FileStack, Users, Wallet, Settings,
  Briefcase, FolderKanban, Newspaper, Inbox, UserRound, Building2, PieChart,
  ArrowLeftRight, ReceiptText, ChartColumn, Building, Image, ShieldCheck, History,
};

function NavIcon({ name, className }) {
  const Icon = ICONS[name] || FileStack;
  return <Icon className={className} aria-hidden="true" />;
}

/**
 * Admin shell: sidebar, header, content area.
 *
 * A Client Component because of the mobile drawer and the collapsible nav groups.
 * The session is passed in from the layout, which resolved it server-side — no
 * session data is fetched from the browser.
 *
 * Navigation items are filtered by permission. That is a usability measure only:
 * hiding a link does not protect the data behind it, and the API enforces the
 * same permissions independently.
 */
export function AdminShell({ session, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const permissions = new Set(session.permissions || []);

  const visibleGroups = ADMIN_NAV.map((group) => {
    if (!group.children) {
      return group.permission && !permissions.has(group.permission) ? null : group;
    }

    const children = group.children.filter(
      (child) => !child.permission || permissions.has(child.permission),
    );

    return children.length ? { ...group, children } : null;
  }).filter(Boolean);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace(`${ADMIN_PATH}/login`);
    // Full reload so no cached server component data survives the logout.
    router.refresh();
  }

  const nav = (
    <nav aria-label="Admin sections" className="flex h-full flex-col">
      <ul className="flex flex-col gap-0.5">
        {visibleGroups.map((group) =>
          group.children ? (
            <li key={group.label}>
              <p className="px-3 pb-1.5 pt-4 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-subtle">
                {group.label}
              </p>

              <ul className="flex flex-col gap-0.5">
                {group.children.map((child) => (
                  <li key={child.href}>
                    <NavLink href={child.href} active={pathname === child.href} icon={child.icon}>
                      {child.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </li>
          ) : (
            <li key={group.href}>
              <NavLink
                href={group.href}
                active={group.exact ? pathname === group.href : pathname.startsWith(group.href)}
                icon={group.icon}
              >
                {group.label}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-surface-muted lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar, desktop */}
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:block lg:h-dvh lg:overflow-y-auto">
        <div className="flex h-full flex-col">
          <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
            <Link href={`${ADMIN_PATH}/dashboard`} className="flex items-center gap-2.5">
              <BrandMark className="size-8" />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-bold">Virallink</span>
                <span className="text-[0.6875rem] text-ink-subtle">Management</span>
              </span>
            </Link>
          </div>

          <div className="flex-1 py-4 pr-3">{nav}</div>
        </div>
      </aside>

      {/* Drawer, mobile */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />

          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
              <span className="flex items-center gap-2.5">
                <BrandMark className="size-7" />
                <span className="text-sm font-bold">Virallink</span>
              </span>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex size-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted"
              >
                <span className="sr-only">Close menu</span>
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 pr-3">{nav}</div>
          </div>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-line bg-surface px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex size-10 items-center justify-center rounded-md border border-line text-ink lg:hidden"
            >
              <span className="sr-only">Open menu</span>
              <Menu className="size-5" aria-hidden="true" />
            </button>

            <p className="text-sm text-ink-muted lg:hidden">
              <span className="font-semibold text-ink">Admin</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle variant="admin" />
            <UserMenu session={session} onSignOut={signOut} />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

/** A sidebar link, with the active state marked for assistive technology. */
function NavLink({ href, active, icon, children }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-ink-soft hover:bg-surface-muted hover:text-brand-600',
      )}
    >
      <NavIcon name={icon} className={cn('size-4 shrink-0', active ? 'text-brand-600' : 'text-ink-subtle')} />
      {children}
    </Link>
  );
}

/** Account menu with sign-out. */
function UserMenu({ session, onSignOut }) {
  const [open, setOpen] = useState(false);

  const initials = (session.name || session.email)
    .split(/[\s@]+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
          {initials}
        </span>

        <span className="hidden flex-col leading-tight sm:flex">
          <span className="text-sm font-medium">{session.name}</span>
          <span className="text-[0.6875rem] text-ink-subtle">
            {session.roles?.[0]?.replace('_', ' ').toLowerCase() || 'user'}
          </span>
        </span>

        <ChevronDown className="size-4 text-ink-subtle" aria-hidden="true" />
      </button>

      {open ? (
        <>
          {/* Click-outside catcher. A full-screen button rather than a document
              listener, so it needs no effect and no cleanup. */}
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            tabIndex={-1}
          />

          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-line bg-surface p-1 shadow-lg"
          >
            <div className="border-b border-line px-3 py-2.5">
              <p className="truncate text-sm font-medium">{session.name}</p>
              <p className="truncate text-xs text-ink-subtle">{session.email}</p>
              <p className="mt-1.5 text-[0.6875rem] text-ink-subtle">
                {session.permissions?.length || 0} permissions
              </p>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-danger-bg hover:text-danger"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default AdminShell;