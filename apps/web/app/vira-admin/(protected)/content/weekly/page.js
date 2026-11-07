import { adminData } from '../../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { StageChip, stageLabel, stageStyle } from '@/components/admin/StagePalette';
import { CONTENT_STAGE_ORDER, METRIC_PLATFORM_LABELS } from '@/shared/enums';
// Default import: next/link has no named `Link` export, so `import { Link }`
// silently yields undefined and React reports "Element type is invalid" at render
// time rather than at build time.
import Link from 'next/link';
import {
  ArrowRight,
  Camera,
  CircleAlert,
  CircleCheck,
  Hourglass,
  Layers,
  Send,
  TrendingUp,
  UserRound,
} from 'lucide-react';

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
 *
 * The colour is functional, not decorative. Each of the nine stages owns one
 * hue (see `StagePalette`), and a stage is the same colour here and on the
 * board. That is what lets a reader take one glance at the ribbon and know
 * that a third of the work is sitting in approval.
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

  /* The headline figures. Each one is tied to a stage or a state, so the colour
     means something: teal is the shoot, pink is the post, amber is the wait. */
  const headline = [
    {
      key: 'inFlight',
      label: 'In flight',
      value: totals.inFlight,
      hint: 'pieces of work open',
      icon: Layers,
      accent: 'bg-stage-idea',
      iconAccent: 'bg-stage-idea/12 text-stage-idea',
    },
    {
      key: 'shooting',
      label: 'Shooting',
      value: totals.shooting,
      hint: 'crews booked this week',
      icon: Camera,
      accent: 'bg-stage-shooting',
      iconAccent: 'bg-stage-shooting/12 text-stage-shooting',
    },
    {
      key: 'posting',
      label: 'Posts',
      value: totals.posting,
      hint: 'scheduled to go live',
      icon: Send,
      accent: 'bg-stage-scheduled',
      iconAccent: 'bg-stage-scheduled/12 text-stage-scheduled',
    },
    {
      key: 'blockedOverThreeDays',
      label: 'Stuck in approval',
      value: totals.blockedOverThreeDays,
      hint: 'more than 3 days',
      icon: Hourglass,
      accent: 'bg-stage-approval',
      iconAccent: 'bg-stage-approval/12 text-stage-approval',
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: totals.overdue,
      hint: 'past their date',
      icon: CircleAlert,
      accent: 'bg-danger',
      iconAccent: 'bg-danger-bg text-danger',
    },
    {
      key: 'unassigned',
      label: 'Unassigned',
      value: totals.unassigned,
      hint: 'no one is on it',
      icon: UserRound,
      accent: 'bg-warning',
      iconAccent: 'bg-warning-bg text-warning',
    },
  ];

  const stages = CONTENT_STAGE_ORDER.map((stage) => ({
    stage,
    label: stageLabel(stage),
    count: Number(stageCounts?.[stage] || 0),
  }));

  const stageTotal = stages.reduce((sum, entry) => sum + entry.count, 0);
  const openStages = stages.filter((entry) => entry.count > 0).length;

  return (
    <>
      <AdminHeader
        title={`Week of ${report.week.label}`}
        description="Production position and what needs attention."
        action={
          <Link
            href="/vira-admin/content"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            Open the board
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        {/* Headline.

            One card rather than six floating ones: the nine-stage ribbon across
            the top ties the numbers to the pipeline they came from, and the
            coloured rule under each figure says which stage it describes. */}
        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <div aria-hidden="true" className="flex h-1.5 w-full">
            {stages.map((entry) => (
              <div key={entry.stage} className={`flex-1 ${stageStyle(entry.stage).bar}`} />
            ))}
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-base font-semibold text-ink">The week at a glance</h2>
              <p className="text-xs text-ink-subtle">
                {stageTotal} piece{stageTotal === 1 ? '' : 's'} open across {openStages} stage
                {openStages === 1 ? '' : 's'}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {headline.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.key}
                    className="rounded-md border border-line bg-surface-muted p-3 transition-colors hover:border-line-strong"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium text-ink-muted">{item.label}</p>
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-sm ${item.iconAccent}`}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                    </div>

                    <p className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-ink">
                      {item.value}
                    </p>

                    <p className="mt-0.5 truncate text-xs text-ink-subtle">{item.hint}</p>

                    <div aria-hidden="true" className={`mt-2.5 h-1 rounded-full ${item.accent}`} />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Needs attention. Only rendered when there is something to attend to —
            a banner that is always on screen teaches people to ignore banners. */}
        {totals.overdue > 0 || totals.blockedOverThreeDays > 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger-bg p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-danger/15 text-danger">
                <TrendingUp className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-danger">This week needs a push</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {totals.overdue > 0 ? (
                    <>
                      <strong className="font-semibold">{totals.overdue}</strong> piece
                      {totals.overdue === 1 ? ' is' : 's are'} past their date
                    </>
                  ) : null}
                  {totals.overdue > 0 && totals.blockedOverThreeDays > 0 ? ' and ' : null}
                  {totals.blockedOverThreeDays > 0 ? (
                    <>
                      <strong className="font-semibold">{totals.blockedOverThreeDays}</strong>{' '}
                      {totals.blockedOverThreeDays === 1 ? 'is' : 'are'} waiting on a client
                    </>
                  ) : null}
                  .
                </p>
              </div>
            </div>

            <Link
              href="/vira-admin/content"
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-danger/30 bg-surface px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-bg sm:self-auto"
            >
              Sort it out
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : null}

        {/* Where the work is sitting.

            The ribbon is the same nine colours as the headline, in pipeline
            order, so the two together give the shape of the week. The tiles
            under it carry the counts, so nothing depends on reading a length. */}
        <AdminPanel title="Where work is sitting" description="Open pieces by stage, in pipeline order.">
          {stageTotal > 0 ? (
            <div aria-hidden="true" className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
              {stages
                .filter((entry) => entry.count > 0)
                .map((entry) => (
                  <div
                    key={entry.stage}
                    className={stageStyle(entry.stage).bar}
                    style={{ width: `${(entry.count / stageTotal) * 100}%` }}
                  />
                ))}
            </div>
          ) : (
            <div aria-hidden="true" className="h-3 w-full rounded-full bg-surface-sunken" />
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
            {stages.map((entry) => {
              const style = stageStyle(entry.stage);
              const share = stageTotal > 0 ? Math.round((entry.count / stageTotal) * 100) : 0;

              return (
                <div
                  key={entry.stage}
                  className={`rounded-md border p-2.5 transition-colors ${
                    entry.count > 0 ? `${style.border} ${style.soft}` : 'border-line bg-surface-muted'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${entry.count > 0 ? style.bar : 'bg-line-strong'}`}
                    />
                    <p
                      className={`truncate text-xs font-medium ${
                        entry.count > 0 ? style.text : 'text-ink-subtle'
                      }`}
                    >
                      {entry.label}
                    </p>
                  </div>

                  <p
                    className={`mt-1.5 font-mono text-xl font-bold ${
                      entry.count > 0 ? 'text-ink' : 'text-ink-subtle'
                    }`}
                  >
                    {entry.count}
                  </p>

                  <p className="text-[0.6875rem] text-ink-subtle">
                    {entry.count > 0 ? `${share}% of open` : 'nothing open'}
                  </p>
                </div>
              );
            })}
          </div>
        </AdminPanel>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Cycle time */}
          <AdminPanel
            title="Cycle time by stage"
            description="Average days a piece spends in each stage before moving on."
          >
            {cycleTime.stages.length ? (
              <>
                <ul className="flex flex-col gap-3">
                  {cycleTime.stages.map((entry) => {
                    const style = stageStyle(entry.stage);
                    const isBottleneck = entry.stage === cycleTime.bottleneck;
                    const longest = cycleTime.stages.reduce(
                      (max, item) => Math.max(max, item.averageDays),
                      0,
                    );
                    const share = longest > 0 ? (entry.averageDays / longest) * 100 : 0;

                    return (
                      <li key={entry.stage} className="flex items-center gap-3">
                        <div className="w-32 shrink-0">
                          <StageChip stage={entry.stage} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span
                              className={`font-mono font-semibold ${
                                isBottleneck ? 'text-danger' : 'text-ink'
                              }`}
                            >
                              {entry.averageDays}d average
                            </span>
                            <span className="shrink-0 text-ink-subtle">
                              worst {entry.worstDays}d · {entry.samples} item
                              {entry.samples === 1 ? '' : 's'}
                            </span>
                          </div>

                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                            <div
                              className={`h-full rounded-full ${isBottleneck ? 'bg-danger' : style.bar}`}
                              style={{ width: `${Math.max(share, entry.averageDays > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <p className="mt-4 text-xs text-ink-subtle">
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

          {/* Waiting on the client */}
          <AdminPanel
            title="Waiting on the client"
            description="In approval for more than three days."
            action={
              report.blocked.length ? (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-danger-bg px-2 py-1 text-xs font-semibold text-danger">
                  <Hourglass className="size-3.5" aria-hidden="true" />
                  {report.blocked.length} stuck
                </span>
              ) : null
            }
          >
            {report.blocked.length ? (
              <ul className="flex flex-col gap-2">
                {report.blocked.map((card) => (
                  <li
                    key={card.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-danger/20 bg-danger-bg/40 px-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium text-ink">{card.title}</span>
                    <span className="shrink-0 text-xs text-ink-subtle">
                      {card.clientName} · since {formatDay(card.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <span className="flex size-9 items-center justify-center rounded-sm bg-success-bg text-success">
                  <CircleCheck className="size-4" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-ink">Nothing is stuck</p>
                <p className="text-xs text-ink-subtle">
                  No piece has been waiting on a client for more than three days.
                </p>
              </div>
            )}
          </AdminPanel>
        </div>

        {/* Schedule */}
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminPanel
            title="Shooting this week"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-stage-shooting/12 px-2 py-1 text-xs font-semibold text-stage-shooting">
                <Camera className="size-3.5" aria-hidden="true" />
                {report.shooting.length} booked
              </span>
            }
          >
            <CardList cards={report.shooting} emptyLabel="Nothing booked to shoot." dateKey="shootDate" />
          </AdminPanel>

          <AdminPanel
            title="Going out this week"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-stage-scheduled/12 px-2 py-1 text-xs font-semibold text-stage-scheduled">
                <Send className="size-3.5" aria-hidden="true" />
                {report.posting.length} scheduled
              </span>
            }
          >
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

/**
 * A list of pieces with their date, coloured by the stage each one is in.
 *
 * The stage colour comes first so the reader can scan a column of them and
 * see at a glance whether this week shoots are still in editing.
 */
function CardList({ cards, emptyLabel, dateKey }) {
  if (!cards.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <span className="flex size-9 items-center justify-center rounded-sm bg-surface-sunken text-ink-subtle">
          <Layers className="size-4" aria-hidden="true" />
        </span>
        <p className="text-sm text-ink-subtle">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {cards.map((card) => {
        const style = stageStyle(card.stage);

        return (
          <li
            key={card.id}
            className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-muted px-3 py-2.5 text-sm transition-colors hover:border-line-strong hover:bg-surface"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className={`h-8 w-1 shrink-0 rounded-full ${style.bar}`} />
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{card.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
                  {card.clientName}
                  {card.platform ? (
                    <>
                      <span aria-hidden="true">·</span>
                      {METRIC_PLATFORM_LABELS[card.platform] || card.platform}
                    </>
                  ) : null}
                </span>
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-2">
              <StageChip stage={card.stage} />
              {card[dateKey] ? (
                <span className="font-mono text-xs text-ink-muted">{formatDay(card[dateKey])}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A calendar day, formatted without the time.
 *
 * The dates on the API are date-only values that arrive as UTC midnight, so
 * they are read in UTC. Formatting them in the viewer own zone would shift a
 * Monday shoot back to Sunday for anyone west of Greenwich.
 */
function formatDay(value) {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}