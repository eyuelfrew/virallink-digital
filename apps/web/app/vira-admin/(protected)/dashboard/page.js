import { adminData } from '../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, StatCard, AdminPanel, TableSkeleton } from '@/components/admin/AdminUI';
import { StatusBadge, DateCell, MoneyCell, NumberCell } from '@/components/admin/Badge';
import { EmptyState } from '@/components/site/Card';
import { FinanceTrendChart } from '@/components/admin/charts';
import { formatMoney, formatMoneyCompact } from '@virallink/shared/format';
import {
  Building2, FolderKanban, Users, PieChart, Inbox,
  TrendingUp, TrendingDown, Wallet, Clock, Activity, AlertTriangle,
} from 'lucide-react';

/**
 * Admin dashboard.
 *
 * Leads with the numbers an administrator checks first, then finance, then the
 * two feeds that need attention today.
 *
 * Charts appear only where a trend carries meaning that a figure cannot: the
 * revenue chart shows direction over time. Everything else is a number.
 */
export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  await requirePermission('client.read');

  const summary = await adminData('/dashboard/summary');
  const data = summary.data;

  // The API being unreachable should say so plainly rather than showing zeros,
  // which would look like a business with no activity.
  if (!summary.ok) {
    return (
      <>
        <AdminHeader title="Dashboard" />

        <AdminPanel>
          <EmptyState
            icon={AlertTriangle}
            title="Dashboard data could not be loaded"
            description={
              summary.status === 403
                ? 'Your role does not have permission to view these metrics.'
                : 'The management service did not respond. Try again in a moment.'
            }
          />
        </AdminPanel>
      </>
    );
  }

  const { counts, finance, trends, statusBreakdown, recentActivity, recentInquiries, deadlines } = data;

  const hasAnyData =
    counts.clients.total > 0 ||
    counts.projects.total > 0 ||
    counts.employees > 0 ||
    finance.lifetime.incomeCents > 0 ||
    counts.inquiries.unread > 0;

  return (
    <>
      <AdminHeader
        title="Dashboard"
        description="An overview of clients, projects, people and finances."
      />

      {!hasAnyData ? (
        <div className="mb-6 rounded-lg border border-info/30 bg-info-bg p-4">
          <p className="text-sm font-medium text-info">Nothing has been added yet</p>
          <p className="mt-1 text-sm text-info/90">
            Start with your company profile and services. Nothing appears on the public website until you publish
            it, so you can build up the content privately first.
          </p>
        </div>
      ) : null}

      {/* Headline figures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active clients"
          value={NumberCellValue(counts.clients.active)}
          hint={`${counts.clients.total} in total`}
          icon={Building2}
          href="/vira-admin/clients"
        />

        <StatCard
          label="Active projects"
          value={NumberCellValue(counts.projects.active)}
          hint={`${counts.projects.completed} completed`}
          icon={FolderKanban}
          href="/vira-admin/portfolio"
        />

        <StatCard
          label="Employees"
          value={NumberCellValue(counts.employees)}
          hint="Active only"
          icon={Users}
          href="/vira-admin/employees"
        />

        <StatCard
          label="Unread enquiries"
          value={NumberCellValue(counts.inquiries.unread)}
          hint="Awaiting a reply"
          tone={counts.inquiries.unread > 0 ? 'info' : 'default'}
          icon={Inbox}
          href="/vira-admin/inquiries"
        />
      </div>

      {/* Finance */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue this month"
          value={formatMoney(finance.month.incomeCents / 100, { currency: finance.currency })}
          tone="success"
          icon={TrendingUp}
        />

        <StatCard
          label="Expenses this month"
          value={formatMoney(finance.month.expenseCents / 100, { currency: finance.currency })}
          tone="warning"
          icon={TrendingDown}
        />

        <StatCard
          label="Profit this month"
          value={formatMoney(finance.month.profitCents / 100, { currency: finance.currency })}
          tone={finance.month.profitCents >= 0 ? 'success' : 'danger'}
          icon={Wallet}
        />

        <StatCard
          label="Outstanding"
          value={formatMoney(finance.outstandingCents / 100, { currency: finance.currency })}
          hint="Unpaid invoice balance"
          tone={finance.outstandingCents > 0 ? 'danger' : 'default'}
          icon={Clock}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {/* Revenue trend. The only chart on the page. */}
        <AdminPanel
          title="Revenue and expenses"
          description="Last 12 months"
          className="xl:col-span-2"
        >
          <FinanceTrendChart data={trends} currency={finance.currency} />
        </AdminPanel>

        {/* What needs attention today */}
        <AdminPanel title="Needs attention" description="Deadlines and overdue invoices">
          {deadlines?.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {deadlines.map((item) => {
                const overdue = new Date(item.dueDate) < new Date();

                return (
                  <li key={`${item.type}-${item.id}`} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.label}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-subtle">
                        {item.type === 'project' ? 'Project deadline' : 'Invoice due'}
                        <span aria-hidden="true">·</span>
                        <DateCell value={item.dueDate} />
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      {item.type === 'invoice' ? (
                        <MoneyCell amount={(item.outstandingCents || 0) / 100} currency={finance.currency} />
                      ) : (
                        <StatusBadge status={item.status} kind="project" />
                      )}
                      {overdue ? (
                        <p className="mt-1 text-xs font-medium text-danger">Overdue</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-ink-subtle">Nothing due. Nothing overdue.</p>
          )}
        </AdminPanel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {/* Recent enquiries */}
        <AdminPanel
          title="Recent enquiries"
          action={
            <a
              href="/vira-admin/inquiries"
              className="text-sm font-semibold text-brand-600 hover:underline"
            >
              View all
            </a>
          }
        >
          {recentInquiries?.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {recentInquiries.map((inquiry) => (
                <li key={inquiry.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {!inquiry.isRead ? (
                        <span className="size-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />
                      ) : null}
                      {inquiry.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-subtle">
                      {inquiry.subject || inquiry.company || 'General enquiry'}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <StatusBadge status={inquiry.status} kind="inquiry" />
                    <p className="mt-1 text-xs text-ink-subtle">
                      <DateCell value={inquiry.createdAt} relative />
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-ink-subtle">No enquiries yet.</p>
          )}
        </AdminPanel>

        {/* Recent activity */}
        <AdminPanel
          title="Recent activity"
          action={
            <a
              href="/vira-admin/activity"
              className="text-sm font-semibold text-brand-600 hover:underline"
            >
              View log
            </a>
          }
        >
          {recentActivity?.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <p className="min-w-0 text-sm">
                    <span className="font-medium">{describeAction(entry.action)}</span>{' '}
                    <span className="text-ink-muted">{entry.entity.replace(/_/g, ' ')}</span>
                  </p>

                  <p className="shrink-0 text-right text-xs text-ink-subtle">
                    <DateCell value={entry.createdAt} relative />
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-ink-subtle">Nothing recorded yet.</p>
          )}
        </AdminPanel>
      </div>

      {/* Composition, only when there is something to compose. */}
      {statusBreakdown?.projects?.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <AdminPanel title="Projects by status">
            <ul className="flex flex-col gap-2.5">
              {statusBreakdown.projects.map((entry) => (
                <li key={entry.status} className="flex items-center justify-between gap-3">
                  <StatusBadge status={entry.status} kind="project" />
                  <NumberCell value={entry.count} />
                </li>
              ))}
            </ul>
          </AdminPanel>

          <AdminPanel title="Clients by status">
            <ul className="flex flex-col gap-2.5">
              {statusBreakdown.clients.map((entry) => (
                <li key={entry.status} className="flex items-center justify-between gap-3">
                  <StatusBadge status={entry.status} kind="client" />
                  <NumberCell value={entry.count} />
                </li>
              ))}
            </ul>
          </AdminPanel>
        </div>
      ) : null}
    </>
  );
}

/** Render a count without a locale wrapper at the call site. */
function NumberCellValue(value) {
  return new Intl.NumberFormat('en-ET').format(value || 0);
}

/** Human phrasing for an audit action. */
function describeAction(action) {
  const map = {
    login: 'Signed in',
    login_failed: 'Failed sign-in',
    logout: 'Signed out',
    create: 'Created',
    update: 'Updated',
    delete: 'Deleted',
    publish: 'Published',
    unpublish: 'Unpublished',
    archive: 'Archived',
    restore: 'Restored',
    financial_create: 'Recorded',
    financial_update: 'Amended',
    financial_delete: 'Removed',
    client_update: 'Updated client',
    employee_update: 'Updated employee',
    portfolio_update: 'Updated portfolio',
    password_change: 'Changed password',
    role_change: 'Changed role',
  };

  return map[action] || action.replace(/_/g, ' ');
}

export { formatMoneyCompact, Activity, PieChart, TableSkeleton };