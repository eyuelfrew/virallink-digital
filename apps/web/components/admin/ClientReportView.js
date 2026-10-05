'use client';

import { useRef } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { ReportExportButtons } from './ReportExportButtons';
import { METRIC_PLATFORM_LABELS, DELIVERABLE_TYPE_LABELS } from '@virallink/shared/enums';

/**
 * The report body, and a Client Component because recharts is client-only.
 *
 * Owns the ref that ReportExportButtons captures, which is why the buttons are
 * rendered here rather than in the page header — the exported region must not
 * contain its own controls.
 *
 * The one rule this component exists to enforce: a figure that was never measured
 * is shown as "not measured", never as 0. Every chart series therefore carries a
 * null for unmeasured months and the chart is configured to leave a gap rather than
 * drop to the axis, so an absent measurement is visibly absent.
 */

const CHART_COLOURS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#64748b'];

export function ClientReportView({ report, monthOptions, currentMonth }) {
  const reportRef = useRef(null);

  const trendData = report.trend.map((point) => ({
    month: shortMonth(point.month),
    // null keeps recharts from drawing a line through months nobody measured.
    views: point.views.measured ? point.views.total : null,
    produced: point.produced,
  }));

  const platformData = report.platforms
    .filter((entry) => entry.views > 0)
    .map((entry) => ({
      name: METRIC_PLATFORM_LABELS[entry.platform] || entry.platform,
      views: entry.views,
      deliverables: entry.deliverables,
    }));

  const totals = report.headline.totals;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* Month switcher sits outside the captured region so the export is the
            report itself, not a toolbar of controls. */}
        <div data-export-ignore className="flex flex-wrap items-center gap-1.5">
          {monthOptions.map((option) => (
            <a
              key={option.value}
              href={`?month=${option.value}`}
              className={
                option.value === currentMonth
                  ? 'rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white'
                  : 'rounded-md border border-line px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-muted'
              }
            >
              {option.label}
            </a>
          ))}
        </div>

        <ReportExportButtons
          targetRef={reportRef}
          title={`${report.client.name} report ${report.month}`}
        />
      </div>

      {/* ---- Everything below here is what gets exported ---- */}
      <div ref={reportRef} className="flex flex-col gap-4 bg-white p-6">
        <header className="border-b border-line pb-4">
          <h2 className="text-2xl font-semibold text-ink">{report.client.name}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Content performance for {longMonth(report.month)}
            {report.client.industry ? ` · ${report.client.industry}` : ''}
          </p>
          <p className="mt-1 text-xs text-ink-subtle">
            Prepared {new Date(report.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </header>

        {/* Headline counts */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="Content produced" value={report.headline.totalProduced} />
          <Figure label="Videos" value={report.headline.videosProduced} />
          <Figure label="Views" value={totals.views} />
          <Figure label="Likes" value={totals.likes} />
        </section>

        {report.delta ? (
          <p className="text-sm text-ink-muted">
            {report.delta.viewsPercent === null ? (
              'No comparable figure for the previous month.'
            ) : (
              <>
                Views {report.delta.viewsPercent >= 0 ? 'up' : 'down'}{' '}
                <strong className={report.delta.viewsPercent >= 0 ? 'text-emerald-600' : 'text-danger'}>
                  {Math.abs(report.delta.viewsPercent)}%
                </strong>{' '}
                on last month.
              </>
            )}
          </p>
        ) : null}

        {/* Trend */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Views by month</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={trendData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}
                  formatter={(value, name) => [
                    value === null ? 'Not measured' : Number(value).toLocaleString('en-GB'),
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="views" name="Views" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                <Bar dataKey="produced" name="Content produced" fill="#0891b2" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-ink-subtle">
            Months with nothing measured are left blank rather than shown as zero.
          </p>
        </section>

        {/* Platform split */}
        {platformData.length ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Views by platform</h3>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={platformData} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}
                    formatter={(value) => [Number(value).toLocaleString('en-GB'), 'Views']}
                  />
                  <Bar dataKey="views" radius={[0, 3, 3, 0]}>
                    {platformData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLOURS[index % CHART_COLOURS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null}

        {/* Content breakdown */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">What was produced</h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(report.headline.producedByType)
              .filter(([, count]) => count > 0)
              .map(([type, count]) => (
                <li key={type} className="rounded-md border border-line p-3">
                  <p className="text-xs text-ink-subtle">{DELIVERABLE_TYPE_LABELS[type] || type}</p>
                  <p className="text-lg font-semibold text-ink">{count}</p>
                </li>
              ))}
          </ul>
        </section>

        {/* Top performers */}
        {report.top.length ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Top performing content</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
                  <th className="py-2 pr-3 font-medium">Content</th>
                  <th className="py-2 pr-3 font-medium">Platform</th>
                  <th className="py-2 pr-3 text-right font-medium">Views</th>
                  <th className="py-2 text-right font-medium">Likes</th>
                </tr>
              </thead>
              <tbody>
                {report.top.map((row) => (
                  <tr key={row.deliverableId} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 text-ink">{row.title}</td>
                    <td className="py-2 pr-3 text-ink-muted">{METRIC_PLATFORM_LABELS[row.platform] || row.platform}</td>
                    <td className="py-2 pr-3 text-right font-medium text-ink">{Number(row.views).toLocaleString('en-GB')}</td>
                    <td className="py-2 text-right text-ink-muted">
                      {row.likes === null ? '—' : Number(row.likes).toLocaleString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* Detail list */}
        {report.deliverables.length ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Content delivered in {longMonth(report.month)}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {report.deliverables.map((row) => (
                <li key={row.id} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
                  <span className="text-ink">{row.title}</span>
                  <span className="shrink-0 text-xs text-ink-subtle">
                    {DELIVERABLE_TYPE_LABELS[row.type] || row.type}
                    {row.platform ? ` · ${METRIC_PLATFORM_LABELS[row.platform] || row.platform}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="border-t border-line pt-3 text-xs text-ink-subtle">
          Figures are entered manually by the Virallink team. A blank means the figure was not
          measured, which is not the same as zero.
        </footer>
      </div>
    </div>
  );
}

/**
 * A headline figure.
 *
 * `measured: false` renders an explicit dash and the word "not measured" in the
 * caption, because printing 0 for something nobody counted is a claim the report
 * cannot support.
 */
function Figure({ label, value }) {
  const measured = typeof value === 'object' && value !== null ? value.measured !== false : true;
  const numeric = typeof value === 'object' && value !== null ? value.total : value;

  return (
    <div className="rounded-md border border-line p-3">
      <p className="text-xs uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">
        {measured ? Number(numeric || 0).toLocaleString('en-GB') : '—'}
      </p>
      {!measured ? <p className="text-[11px] text-ink-subtle">not measured</p> : null}
    </div>
  );
}

function shortMonth(value) {
  const [year, month] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
}

function longMonth(value) {
  const [year, month] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default ClientReportView;