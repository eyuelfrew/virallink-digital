import { adminData } from '../../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel, StatCard } from '@/components/admin/AdminUI';
import { CONTENT_STAGE_LABELS } from '@/shared/enums';
// Default import: next/link has no named `Link` export, so `import { Link }`
// silently yields undefined and React reports "Element type is invalid" at render
// time rather than at build time.
import Link from 'next/link';

export const metadata = { title: 'Weekly report' };

/**
 * The weekly operational report.
 *
 * Deliberately not a client-facing document. It answers "is the week covered and
 * what is stuck", which is a management question; the monthly client report answers
 * "what did we deliver and how did it perform", which is a commercial one.
 *
 * The cycle-time block is the reason this page exists. If approval averages six
 * days and editing averages one, the constraint is the client and no amount of
 * internal tidying will fix it — and you cannot see that from a list of cards.
 */
export default async function WeeklyReportPage() {
  await requirePermission('content.read');

  const reportResult = await adminData('/content/weekly');
  const report = reportResult.data;

  if (!report) {
    return (
      <>
        <AdminHeader title="Weekly report" description="This week's production position." />
        <AdminPanel>
          <p className="py-10 text-center text-sm text-ink-muted">
            The report could not be loaded. Check that the API is running.
          </p>
        </AdminPanel>
      </>
    );
  }

  const { totals, stageCounts, cycleTime } = report;

  return (
    <>
      <AdminHeader title={`Week of ${report.week.label}`} description="Production position and what needs attention." />

      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="In flight" value={totals.inFlight} hint="pieces of work open" />
          <StatCard label="Shooting this week" value={totals.shooting} hint="crews booked" />
          <StatCard label="Posts this week" value={totals.posting} hint="scheduled to go live" />
          <StatCard
            label="Stuck in approval"
            value={totals.blockedOverThreeDays}
            hint="more than 3 days"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Funnel */}
          <AdminPanel title="Where work is sitting">
            <ul className="flex flex-col gap-2">
              {Object.entries(stageCounts).map(([stage, count]) => (
                <li key={stage} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-sm text-ink-soft">{CONTENT_STAGE_LABELS[stage]}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <span
                      className="block h-full rounded-full bg-brand-500"
                      style={{
                        // Scaled against the busiest column, so the shape of the
                        // bottleneck is readable at a glance.
                        width: `${Math.max(count ? 4 : 0, (count / Math.max(1, Math.max(...Object.values(stageCounts)))) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right text-sm font-medium text-ink">{count}</span>
                </li>
              ))}
            </ul>
          </AdminPanel>

          {/* Cycle time */}
          <AdminPanel
            title="Cycle time by stage"
            description="Average days a piece spends in each stage before moving on."
          >
            {cycleTime.stages.length ? (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
                      <th className="py-2 font-medium">Stage</th>
                      <th className="py-2 text-right font-medium">Average</th>
                      <th className="py-2 text-right font-medium">Worst</th>
                      <th className="py-2 text-right font-medium">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycleTime.stages.map((entry) => (
                      <tr key={entry.stage} className="border-b border-line last:border-0">
                        <td className="py-2 text-ink">{CONTENT_STAGE_LABELS[entry.stage]}</td>
                        <td
                          className={
                            entry.stage === cycleTime.bottleneck
                              ? 'py-2 text-right font-semibold text-danger'
                              : 'py-2 text-right text-ink'
                          }
                        >
                          {entry.averageDays}d
                        </td>
                        <td className="py-2 text-right text-ink-muted">{entry.worstDays}d</td>
                        <td className="py-2 text-right text-ink-muted">{entry.samples}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="mt-3 text-xs text-ink-subtle">
                  {cycleTime.reliable
                    ? 'The slowest stage is highlighted. A stage with one item cannot show a pattern, so only stages with two or more are treated as a bottleneck.'
                    : 'Not enough movement yet to call a bottleneck — every stage needs at least two items before the figures mean anything.'}
                </p>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-ink-subtle">
                No completed stage transitions yet. Move a card and this fills in.
              </p>
            )}
          </AdminPanel>
        </div>

        {/* Needs attention */}
        {report.blocked.length ? (
          <AdminPanel title="Waiting on the client" description="In approval for more than three days.">
            <ul className="flex flex-col gap-2">
              {report.blocked.map((card) => (
                <li key={card.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">{card.title}</span>
                  <span className="text-xs text-ink-subtle">
                    {card.clientName} · since{' '}
                    {new Date(card.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          </AdminPanel>
        ) : null}

        {/* Schedule */}
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminPanel title="Shooting this week">
            <CardList cards={report.shooting} emptyLabel="Nothing booked to shoot." dateKey="shootDate" />
          </AdminPanel>
          <AdminPanel title="Going out this week">
            <CardList cards={report.posting} emptyLabel="Nothing scheduled to post." dateKey="scheduledFor" />
          </AdminPanel>
        </div>

        <p className="text-xs text-ink-subtle">
          Looking for views and likes? Those are monthly figures and live in the{' '}
          <Link href="/vira-admin/clients" className="font-medium text-brand-600 hover:underline">
            client report
          </Link>
          .
        </p>
      </div>
    </>
  );
}

function CardList({ cards, emptyLabel, dateKey }) {
  if (!cards.length) return <p className="py-6 text-center text-sm text-ink-subtle">{emptyLabel}</p>;

  return (
    <ul className="flex flex-col gap-2">
      {cards.map((card) => (
        <li key={card.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink">{card.title}</span>
          <span className="shrink-0 text-xs text-ink-subtle">
            {card.clientName}
            {card[dateKey]
              ? ` · ${new Date(card[dateKey]).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                })}`
              : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}