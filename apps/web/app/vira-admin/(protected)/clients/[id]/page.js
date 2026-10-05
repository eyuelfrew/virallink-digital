import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminRecord, adminData } from '../../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { ADMIN_PATH } from '@/lib/config';
import { AdminHeader, AdminPanel, TableWrapper, Th, Td } from '@/components/admin/AdminUI';
import { StatusBadge, DateCell, MoneyCell, BooleanBadge } from '@/components/admin/Badge';
import { ClientFormDialog } from '@/components/admin/ClientFormDialog';
import { DeliverableFormDialog } from '@/components/admin/DeliverableFormDialog';
import { MetricFormDialog } from '@/components/admin/MetricFormDialog';
import { ClientActivityForms } from '@/components/admin/ClientActivityForms';

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `Client #${id}` };
}

/**
 * Client detail.
 *
 * This page is the reason `client_notes` and `client_communications` were worth
 * having. Both tables have existed with an endpoint to write to them and no way to
 * read them: the clients page was a list with a delete button, so staff could log
 * a call and then never see it again. Everything below is already-stored data
 * finally being displayed.
 *
 * Deliverables and figures are month-scoped, so the page takes a `month` query
 * parameter rather than showing everything at once — a client with two years of
 * work would otherwise produce an unreadable table.
 */
export default async function ClientDetailPage({ params, searchParams }) {
  await requirePermission('client.read');

  const { id } = await params;
  const query = await searchParams;

  const month = typeof query?.month === 'string' ? query.month : currentMonth();

  const [clientResult, deliverablesResult] = await Promise.all([
    adminRecord(`/clients/${id}`),
    adminData(`/deliverables?clientId=${id}&month=${month}&pageSize=100`).catch(() => ({ data: [] })),
  ]);

  if (clientResult.status === 404) notFound();

  const client = clientResult.record?.client || clientResult.record;
  if (!client) notFound();

  const deliverables = deliverablesResult.data || [];
  /*
   * Notes and communications arrive on the client record itself. There is no list
   * endpoint for either, and adding two single-purpose fetches would be slower and
   * no more correct — the record is the natural place for a client's own history.
   */
  const notes = client.clientNotes || [];
  const communications = client.communications || [];

  const videosThisMonth = deliverables.filter((row) => row.type === 'video').length;
  const monthViews = deliverables.reduce(
    (total, row) =>
      total +
      row.metrics
        .filter((metric) => metric.month === month)
        .reduce((sum, metric) => sum + (Number(metric.views) || 0), 0),
    0,
  );

  const outstanding = (client.invoices || []).reduce((sum, invoice) => sum + (Number(invoice.outstanding) || 0), 0);

  return (
    <>
      <AdminHeader
        title={client.name}
        description={client.industry || 'Client record'}
        breadcrumb={
          <Link
            href={`${ADMIN_PATH}/clients`}
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            ← All clients
          </Link>
        }
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`${ADMIN_PATH}/clients/${id}/report?month=${month}`}
              className="inline-flex h-9 items-center rounded-md bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600"
            >
              View report
            </Link>
            <ClientFormDialog client={client} triggerLabel="Edit profile" />
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        {/* Headline numbers for the selected month. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label={`Content in ${formatMonth(month)}`} value={deliverables.length} hint={`${videosThisMonth} video`} />
          <SummaryTile
            label="Views recorded"
            value={monthViews.toLocaleString('en-GB')}
            hint={monthViews > 0 ? 'this month' : 'none entered'}
          />
          <SummaryTile
            label="Outstanding"
            value={outstanding > 0 ? formatMoney(outstanding) : '—'}
            hint={outstanding > 0 ? 'across invoices' : 'nothing overdue'}
          />
          <SummaryTile
            label="Last contact"
            value={lastContact(communications)}
            hint={`${communications.length} logged`}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Profile */}
          <AdminPanel title="Profile" className="lg:col-span-1">
            <dl className="flex flex-col gap-3 text-sm">
              <Detail label="Status" value={<StatusBadge status={client.status} entityKind="client" />} />
              <Detail label="Contact" value={client.contactPerson} />
              <Detail label="Email" value={client.email} />
              <Detail label="Phone" value={client.phone} />
              <Detail label="Website" value={client.website} />
              <Detail label="Industry" value={client.industry} />
              <Detail
                label="Contract value"
                value={client.contractValue ? <MoneyCell amount={client.contractValue} /> : null}
              />
              <Detail label="On website" value={<BooleanBadge value={client.isPublic} trueLabel="Yes" falseLabel="No" />} />
            </dl>
          </AdminPanel>

          {/* Deliverables */}
          <AdminPanel
            title={`Content — ${formatMonth(month)}`}
            className="lg:col-span-2"
            action={<DeliverableFormDialog clientId={client.id} triggerLabel="Add deliverable" />}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-subtle">Month</span>
              {shiftMonths(month, -2).map((option) => (
                <Link
                  key={option}
                  href={`${ADMIN_PATH}/clients/${id}?month=${option}`}
                  className={
                    option === month
                      ? 'rounded-md bg-brand-500 px-2 py-1 font-medium text-white'
                      : 'rounded-md border border-line px-2 py-1 text-ink-muted hover:bg-surface-muted'
                  }
                >
                  {formatMonth(option)}
                </Link>
              ))}
            </div>

            {deliverables.length ? (
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Deliverable</Th>
                    <Th>Type</Th>
                    <Th>Views ({monthViews ? 'this month' : 'entered'})</Th>
                    <Th align="right">Figures</Th>
                  </tr>
                </thead>
                <tbody>
                  {deliverables.map((row) => {
                    const metric = row.metrics.find((entry) => entry.month === month);

                    return (
                      <tr key={row.id}>
                        <Td>
                          {row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-brand-600 hover:underline"
                            >
                              {row.title}
                            </a>
                          ) : (
                            <span className="font-medium text-ink">{row.title}</span>
                          )}
                          <span className="mt-0.5 block text-xs text-ink-subtle">
                            {formatMonth((row.publishedAt || '').slice(0, 7))}
                            {row.platform ? ` · ${row.platform}` : ''}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-sm text-ink-soft">{row.type}</span>
                        </Td>
                        <Td>
                          {metric && metric.views !== null ? (
                            <span className="font-medium text-ink">{Number(metric.views).toLocaleString('en-GB')}</span>
                          ) : (
                            <span className="text-ink-subtle" title="Not measured">
                              not measured
                            </span>
                          )}
                        </Td>
                        <Td align="right">
                          <MetricFormDialog
                            deliverable={row}
                            existing={metric}
                            triggerLabel={metric ? 'Update' : 'Add figures'}
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrapper>
            ) : (
              <p className="py-8 text-center text-sm text-ink-subtle">
                Nothing recorded for {formatMonth(month)}. Add a deliverable to start the month.
              </p>
            )}
          </AdminPanel>
        </div>

        {/* CRM */}
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminPanel
            title="Notes"
            action={<ClientActivityForms clientId={client.id} kind="note" triggerLabel="Add note" />}
          >
            {notes.length ? (
              <ul className="flex flex-col gap-3">
                {notes.map((note) => (
                  <li key={note.id} className="rounded-md border border-line p-3">
                    <p className="whitespace-pre-wrap text-sm text-ink">{note.body}</p>
                    <p className="mt-2 text-xs text-ink-subtle">
                      {note.author?.name || 'Unknown'} · <DateCell value={note.createdAt} />
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-ink-subtle">No notes yet.</p>
            )}
          </AdminPanel>

          <AdminPanel
            title="Communications"
            action={<ClientActivityForms clientId={client.id} kind="communication" triggerLabel="Log contact" />}
          >
            {communications.length ? (
              <ul className="flex flex-col gap-3">
                {communications.map((entry) => (
                  <li key={entry.id} className="rounded-md border border-line p-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-medium uppercase text-ink-muted">
                        {entry.type}
                      </span>
                      {entry.subject ? <span className="text-sm font-medium text-ink">{entry.subject}</span> : null}
                    </div>
                    {entry.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{entry.body}</p> : null}
                    <p className="mt-2 text-xs text-ink-subtle">
                      {entry.author?.name || 'Unknown'} · <DateCell value={entry.occurredAt} />
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-ink-subtle">Nothing logged yet.</p>
            )}
          </AdminPanel>
        </div>

        {/* Commercial */}
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminPanel title="Projects">
            {client.projects?.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {client.projects.map((project) => (
                  <li key={project.id} className="flex items-center justify-between gap-3">
                    <span className="text-ink">{project.title}</span>
                    <span className="text-xs text-ink-subtle">{project.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-ink-subtle">No projects linked.</p>
            )}
          </AdminPanel>

          <AdminPanel title="Invoices">
            {client.invoices?.length ? (
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>Number</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Outstanding</Th>
                  </tr>
                </thead>
                <tbody>
                  {client.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <Td>
                        <span className="text-sm text-ink">{invoice.invoiceNumber}</span>
                      </Td>
                      <Td align="right">
                        <MoneyCell amount={invoice.total} />
                      </Td>
                      <Td align="right">
                        {Number(invoice.outstanding) > 0 ? (
                          <MoneyCell amount={invoice.outstanding} />
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>
            ) : (
              <p className="py-6 text-center text-sm text-ink-subtle">No invoices.</p>
            )}
          </AdminPanel>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Local helpers                                                              */
/* -------------------------------------------------------------------------- */

function SummaryTile({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-right text-ink">{value ?? <span className="text-ink-subtle">—</span>}</dd>
    </div>
  );
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' -> 'October 2026'. Returns the raw value if it is not that shape. */
function formatMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return value || '';
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The month itself plus the two before it, newest first. */
function shiftMonths(month, back) {
  return Array.from({ length: Math.abs(back) + 1 }, (_, index) => shiftMonth(month, -index));
}

function lastContact(communications) {
  if (!communications?.length) return '—';
  const latest = communications
    .map((entry) => new Date(entry.occurredAt || entry.createdAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0];

  if (!latest) return '—';

  return latest.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMoney(amount) {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(amount);
}