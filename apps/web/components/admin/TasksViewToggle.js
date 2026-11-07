import Link from 'next/link';
import { Columns3, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Table / Board switcher for the tasks module.
 *
 * Two links rather than client state: each view is its own route, so the current
 * view survives a refresh, is shareable, and the Swiss-army table keeps its own
 * filters. `aria-current` marks the active one for assistive tech.
 */
const VIEWS = [
  { key: 'table', label: 'Table', href: '/vira-admin/tasks', Icon: LayoutList },
  { key: 'board', label: 'Board', href: '/vira-admin/tasks/board', Icon: Columns3 },
];

export function TasksViewToggle({ view = 'table' }) {
  return (
    <div className="inline-flex items-center rounded-md border border-line p-0.5" role="group" aria-label="Task view">
      {VIEWS.map(({ key, label, href, Icon }) => {
        const active = view === key;

        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-sm font-medium transition-colors',
              active ? 'bg-brand-500 text-white' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export default TasksViewToggle;
