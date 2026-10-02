import { adminData } from '../../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { StatCard } from '@/components/admin/AdminUI';
import { formatMoney } from '@virallink/shared/format';
import { TrendingUp, TrendingDown, Wallet, ReceiptText } from 'lucide-react';

export const metadata = { title: 'Financial reports' };

export default async function FinanceReportsPage({ searchParams }) {
  await requirePermission('finance.read');

  const params = await searchParams;
  const from = params?.from || '';
  const to = params?.to || '';
  const type = params?.type || '';

  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  if (type) query.set('type', type);

  const result = await adminData(`/finance/reports${query.toString() ? `?${query}` : ''}`);
  const report = result.data;

  if (!report) {
    return (
      <>
        <AdminHeader title="Financial reports" />
        <AdminPanel>
          <p className="py-8 text-center text-sm text-ink-muted">
            {result.status === 403 ? 'Your role does not have permission to view financial reports.' : 'No data available.'}
          </p>
        </AdminPanel>
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title="Financial reports"
        description="Income, expenses and profit over a date range."
        action={
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="from" className="text-xs font-medium text-ink-subtle">From</label>
              <input id="from" name="from" type="date" defaultValue={from} className="h-9 rounded-md border border-line bg-surface px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="to" className="text-xs font-medium text-ink-subtle">To</label>
              <input id="to" name="to" type="date" defaultValue={to} className="h-9 rounded-md border border-line bg-surface px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="type" className="text-xs font-medium text-ink-subtle">Type</label>
              <select id="type" name="type" defaultValue={type} className="h-9 rounded-md border border-line bg-surface px-3 text-sm">
                <option value="">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <button type="submit" className="h-9 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
              Apply
            </button>
          </form>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Income" value={formatMoney(report.incomeCents / 100, { currency: report.currency })} tone="success" icon={TrendingUp} />
        <StatCard label="Expenses" value={formatMoney(report.expenseCents / 100, { currency: report.currency })} tone="warning" icon={TrendingDown} />
        <StatCard label="Profit" value={formatMoney(report.profitCents / 100, { currency: report.currency })} tone={report.profitCents >= 0 ? 'success' : 'danger'} icon={Wallet} />
        <StatCard label="Transactions" value={report.transactionCount} icon={ReceiptText} />
      </div>

      {report.byCategory?.length ? (
        <div className="mt-4">
          <AdminPanel title="By category" description="Breakdown of transactions by category">
            <ul className="flex flex-col divide-y divide-line">
              {report.byCategory.map((cat) => (
                <li key={cat.categoryId} className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium text-ink-soft">{cat.name}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-ink-subtle">{cat.count} transactions</span>
                    <span className="font-mono text-sm tabular-nums">
                      {formatMoney(cat.totalCents / 100, { currency: report.currency })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </AdminPanel>
        </div>
      ) : null}
    </>
  );
}