'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend,
} from 'recharts';

/**
 * Finance trend chart.
 *
 * A ComposedChart rather than three separate ones: income and expenses are
 * compared against each other over time, so they belong on one axis where the
 * gap between them is visible.
 *
 * The chart is loaded only where it is used, so Recharts never enters the public
 * bundle. On shared hosting that matters — it is the largest dependency in the
 * project and the admin pages are the only place it appears.
 *
 * Values arrive as integer cents and are divided by 100 for display. The axis is
 * formatted as compact currency so a large figure does not crowd the axis.
 */
export function FinanceTrendChart({ data = [], currency = 'ETB' }) {
  const chartData = useMemo(
    () =>
      (data || []).map((point) => ({
        month: point.label,
        // Cents → currency units, for a readable axis.
        income: point.incomeCents / 100,
        expense: point.expenseCents / 100,
        profit: point.profitCents / 100,
      })),
    [data],
  );

  const hasActivity = chartData.some((point) => point.income || point.expense);

  if (!hasActivity) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-ink-subtle">
          No transactions recorded yet. The chart appears once there is something to show.
        </p>
      </div>
    );
  }

  const compactCurrency = (value) => {
    const absolute = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(1)}M`;
    if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(0)}K`;
    return `${sign}${absolute.toFixed(0)}`;
  };

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--ink-subtle)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />

          <YAxis
            tick={{ fontSize: 11, fill: 'var(--ink-subtle)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={compactCurrency}
            width={52}
          />

          <Tooltip
            // The formatter is a function, so it needs the currency in scope —
            // hence an inline content wrapper rather than a bare formatter prop.
            content={<ChartTooltip currency={currency} />}
            cursor={{ fill: 'var(--surface-sunken)' }}
          />

          <Legend
            verticalAlign="top"
            height={28}
            iconType="plainline"
            iconSize={14}
            wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
          />

          <Bar
            dataKey="income"
            name="Income"
            fill="var(--brand-500)"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />

          <Bar
            dataKey="expense"
            name="Expenses"
            fill="var(--accent-400)"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />

          <Line
            type="monotone"
            dataKey="profit"
            name="Profit"
            stroke="var(--success)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tooltip body. Kept as its own component so the currency closes over correctly. */
function ChartTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 shadow-md">
      <p className="text-xs font-semibold">{label}</p>

      <ul className="mt-1.5 flex flex-col gap-1">
        {payload.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color || entry.fill }}
              aria-hidden="true"
            />
            <span className="text-ink-muted">{entry.name}</span>
            <span className="ml-auto font-mono tabular-nums">
              {new Intl.NumberFormat('en-ET', {
                style: 'currency',
                currency: currency || 'ETB',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FinanceTrendChart;