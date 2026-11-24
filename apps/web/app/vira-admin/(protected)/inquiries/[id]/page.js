import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminRecord } from '../../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { ADMIN_PATH } from '@/lib/config';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { StatusBadge, DateCell } from '@/components/admin/Badge';
import InquiryControls from '@/components/admin/InquiryControls';

export const metadata = { title: 'Inquiry' };

/**
 * Inquiry detail.
 *
 * The list page could only show the header fields and a delete button, so the
 * actual message — the whole reason someone filled in the contact form — was
 * unreadable. This page shows the submission and the admin-only controls for
 * status, read state, notes and archiving.
 */
export default async function InquiryDetailPage({ params }) {
  await requirePermission('inquiry.read');

  const { id } = await params;
  const result = await adminRecord(`/inquiries/${id}`);

  if (result.status === 404) notFound();

  const inquiry = result.record;
  if (!inquiry) notFound();

  const name = inquiry.name || 'Unnamed inquiry';

  return (
    <>
      <AdminHeader
        title={name}
        description={inquiry.subject || 'Contact form submission'}
        breadcrumb={
          <Link
            href={`${ADMIN_PATH}/inquiries`}
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            ← Inquiries
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <AdminPanel title="Message">
            {inquiry.message ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{inquiry.message}</p>
            ) : (
              <p className="text-sm text-ink-subtle">No message was supplied.</p>
            )}
          </AdminPanel>

          <AdminPanel title="Submitted by">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Name</dt>
                <dd className="mt-0.5 text-ink-soft">{inquiry.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Email</dt>
                <dd className="mt-0.5 break-all text-ink-soft">
                  {inquiry.email ? (
                    <a href={`mailto:${inquiry.email}`} className="text-brand-600 hover:underline">
                      {inquiry.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Phone</dt>
                <dd className="mt-0.5 text-ink-soft">
                  {inquiry.phone ? (
                    <a href={`tel:${inquiry.phone.replace(/[^+\d]/g, '')}`} className="text-brand-600 hover:underline">
                      {inquiry.phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Company</dt>
                <dd className="mt-0.5 text-ink-soft">{inquiry.company || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Received</dt>
                <dd className="mt-0.5 text-ink-soft"><DateCell value={inquiry.createdAt} /></dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Status</dt>
                <dd className="mt-0.5"><StatusBadge status={inquiry.status} entityKind="inquiry" /></dd>
              </div>
            </dl>
          </AdminPanel>
        </div>

        <div className="lg:col-span-4">
          <AdminPanel title="Manage inquiry">
            <InquiryControls inquiry={inquiry} />
          </AdminPanel>
        </div>
      </div>
    </>
  );
}
