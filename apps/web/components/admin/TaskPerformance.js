'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Award, Clock, Gauge, Medal, TrendingUp } from 'lucide-react';
import { AdminPanel, TableWrapper, Th, Td } from '@/components/admin/AdminUI';
import { cn } from '@/lib/utils';

/**
 * Team performance.
 *
 * A leaderboard, so it is read at a glance: who finished the most, how fast
 * they closed it, and what they still have open. The figures come from the
 * server already counted and ranked — this component only presents them.
 *
 * The period switcher navigates rather than filtering in memory, so the window
 * is in the URL, shareable, and survives a refresh.
 */

/** A figure that has not been measured says so, rather than showing a zero. */
function Rate({ value, suffix = '%' }) {
  if (value === null || value === undefined) {
    return <span className="text-ink-subtle" title="Not measured">—</span>;
  }

  return <span className="font-medium text-ink">{value}{suffix}</span>;
}

function Days({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-ink-subtle" title="Not measured">—</span>;
  }

  return (
    <span className="font-medium text-ink">
      {value}
      <span className="ml-0.5 text-xs font-normal text-ink-subtle">{value === 1 ? 'day' : 'days'}</span>
    </span>
  );
}

function StatTile({ label, value, hint, icon: Icon, tone = 'text-brand-500' }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
        {Icon ? <Icon className={cn('size-4 shrink-0', tone)} aria-hidden="true" /> : null}
      </div>

      <p className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

/** The bar behind the completed column, scaled to the best performer. */
function CompletionBar({ value, max }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${width}%` }} />
      </div>
      <span className="font-mono text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

export function TaskPerformance({ data, period, periods, basePath }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const people = data?.people || [];
  const totals = data?.totals || { completed: 0, open: 0, overdue: 0, people: 0, onTimeRate: null };
  const maxCompleted = people.reduce((max, person) => Math.max(max, person.completed), 0);

  function changePeriod(next) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', next);

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const hasActivity = totals.completed > 0 || totals.open > 0;

  return (
    <div className="flex flex-col gap-4">
      <AdminPanel dense>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Team performance</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              A task counts as completed from the moment it was closed, so the window is the same for everybody.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="performance-period" className="text-xs font-medium text-ink-muted">
              Period
            </label>

            <select
              id="performance-period"
              value={period}
              onChange={(event) => changePeriod(event.target.value)}
              className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:outline-none"
            >
              {periods.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Completed"
            value={totals.completed}
            hint={`Across ${totals.people} ${totals.people === 1 ? 'person' : 'people'}`}
            icon={TrendingUp}
          />
          <StatTile
            label="Still open"
            value={totals.open}
            hint={totals.overdue ? `${totals.overdue} past due` : 'Nothing past due'}
            icon={Gauge}
            tone={totals.overdue ? 'text-danger' : 'text-brand-500'}
          />
          <StatTile
            label="On time"
            value={totals.onTimeRate === null ? '—' : `${totals.onTimeRate}%`}
            hint="Closed by its due date"
            icon={Medal}
            tone="text-success"
          />
          <StatTile
            label="Team size"
            value={totals.people}
            hint="People with an account"
            icon={Award}
          />
        </div>
      </AdminPanel>

      <AdminPanel dense>
        {hasActivity ? (
          <TableWrapper>
            <thead>
              <tr>
                <Th align="right">#</Th>
                <Th>Person</Th>
                <Th>Completed</Th>
                <Th>On time</Th>
                <Th>Avg. turnaround</Th>
                <Th align="right">Open</Th>
                <Th align="right">Past due</Th>
              </tr>
            </thead>

            <tbody>
              {people.map((person) => (
                <tr key={person.employeeId} className="transition-colors hover:bg-surface-muted">
                  <Td align="right">
                    <span
                      className={cn(
                        'font-mono text-sm font-semibold',
                        person.rank === 1 && person.completed > 0 ? 'text-brand-600' : 'text-ink-subtle',
                      )}
                    >
                      {person.rank}
                    </span>
                  </Td>

                  <Td>
                    <span className="font-medium text-ink">{person.name}</span>
                    <span className="mt-0.5 block text-xs text-ink-subtle">
                      {[person.position, person.department].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </Td>

                  <Td>
                    <CompletionBar value={person.completed} max={maxCompleted} />
                  </Td>

                  <Td>
                    <Rate value={person.onTimeRate} />
                  </Td>

                  <Td>
                    <Days value={person.avgDaysToComplete} />
                  </Td>

                  <Td align="right">
                    <span className="text-sm text-ink-soft">{person.open}</span>
                  </Td>

                  <Td align="right">
                    {person.overdue ? (
                      <span className="text-sm font-semibold text-danger">{person.overdue}</span>
                    ) : (
                      <span className="text-sm text-ink-subtle">0</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        ) : (
          <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
            <Clock className="size-8 text-ink-subtle" aria-hidden="true" />
            <p className="mt-4 text-base font-semibold text-ink-soft">No task activity yet</p>
            <p className="mt-2 max-w-md text-sm text-ink-muted">
              The report fills in as tasks are assigned and closed. Pick a longer period if the work you are looking
              for happened earlier.
            </p>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

export default TaskPerformance;
