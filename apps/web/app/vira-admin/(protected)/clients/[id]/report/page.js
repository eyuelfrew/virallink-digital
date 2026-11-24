import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminRecord } from '../../../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { ADMIN_PATH } from '@/lib/config';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { BackToDashboard } from '@/components/admin/AdminUI';
import { ClientReportView } from '@/components/admin/ClientReportView';

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `Client report #${id}` };
}

/**
 * The client-facing report.
 *
 * Server Component: it fetches the whole report in one call and hands the result
 * to a client component that owns the charts and the export buttons. Splitting it
 * this way keeps recharts — and the two large export libraries — out of the
 * initial payload for anyone who only needs the admin list.
 *
 * The month is a query parameter rather than route state so a report is a
 * shareable, reloadable URL. That matters because the thing being sent to a client
 * is a link someone will open again next month.
 */
export default async function ClientReportPage({ params, searchParams }) {
  await requirePermission('client.read');

  const { id } = await params;
  const query = await searchParams;

  const month = typeof query?.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)
    ? query.month
    : currentMonth();

  const [clientResult, reportResult] = await Promise.all([
    adminRecord(`/clients/${id}`),
    adminRecord(`/clients/${id}/report?month=${month}&months=${query?.months || 6}`),
  ]);

  if (clientResult.status === 404 || reportResult.status === 404) notFound();

  const client = clientResult.record?.client || clientResult.record;
  const report = reportResult.record;

  if (!client || !report) notFound();

  return (
    <>
      <AdminHeader
        title={`${client.name} — report`}
        description="Share this page, or export it as an image or PDF."
        breadcrumb={
          <Link
            href={`${ADMIN_PATH}/clients/${id}`}
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            ← {client.name}
          </Link>
        }
      />

      {report.headline.totalProduced === 0 && !report.platforms.length ? (
        <AdminPanel>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm font-medium text-ink">Nothing to report for {longMonth(month)}</p>
            <p className="max-w-md text-sm text-ink-muted">
              Once content is logged against this client with a publication date in {longMonth(month)},
              and figures are entered for it, the report fills in here.
            </p>
            <Link
              href={`${ADMIN_PATH}/clients/${id}`}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              Back to {client.name}
            </Link>
          </div>
        </AdminPanel>
      ) : (
        <ClientReportView
          report={report}
          currentMonth={month}
          monthOptions={monthOptions(month, report.months || 6)}
        />
      )}

      <div className="mt-4 flex items-center gap-3">
        <Link href={`${ADMIN_PATH}/clients/${id}`} className="text-sm font-medium text-brand-600 hover:underline">
          ← Back to {client.name}
        </Link>
        <BackToDashboard />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Local helpers                                                              */
/* -------------------------------------------------------------------------- */

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The selected month plus the months before it, newest first. */
function monthOptions(month, count) {
  return Array.from({ length: Math.min(Math.max(count, 1), 12) }, (_, index) => {
    const value = shiftMonth(month, -index);
    return { value, label: longMonth(value) };
  });
}

function longMonth(value) {
  const [year, month] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}