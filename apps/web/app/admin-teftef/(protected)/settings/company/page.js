import { adminData } from '../../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { CompanyFormDialog } from '@/components/admin/CompanyFormDialog';
import { Building } from 'lucide-react';

export const metadata = { title: 'Company settings' };

export default async function CompanySettingsPage() {
  await requirePermission('company.read');

  const result = await adminData('/company');
  const company = result.data?.company;

  return (
    <>
      <AdminHeader
        title="Company profile"
        description="This information appears throughout the public website."
        action={<CompanyFormDialog company={company} triggerLabel="Edit profile" />}
      />

      {company ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminPanel title="Profile">
            <dl className="flex flex-col gap-4">
              <Detail label="Name" value={company.name} />
              <Detail label="Legal name" value={company.legalName} />
              <Detail label="Short description" value={company.shortDescription} />
              <Detail label="Founded" value={company.foundedDate} />
              <Detail label="Registration number" value={company.registrationNumber} />
            </dl>
          </AdminPanel>

          <AdminPanel title="Contact">
            <dl className="flex flex-col gap-4">
              <Detail label="Phone" value={company.phone} />
              <Detail label="Email" value={company.email} />
              <Detail label="Website" value={company.website} />
              <Detail label="Address" value={[company.addressLine1, company.city, company.country].filter(Boolean).join(', ')} />
              <Detail label="Hours" value={company.openingHours} />
            </dl>
          </AdminPanel>

          <AdminPanel title="Social links" className="lg:col-span-2">
            {company.socialLinks?.length ? (
              <ul className="flex flex-wrap gap-4">
                {company.socialLinks.map((link) => (
                  <li key={link.platform}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-600 hover:underline">
                      {link.label || link.platform}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No social links added yet.</p>
            )}
          </AdminPanel>

          <AdminPanel title="SEO defaults" className="lg:col-span-2">
            <dl className="flex flex-col gap-4">
              <Detail label="Meta title" value={company.metaTitle} />
              <Detail label="Meta description" value={company.metaDescription} />
            </dl>
          </AdminPanel>
        </div>
      ) : (
        <AdminPanel>
          <p className="py-8 text-center text-sm text-ink-muted">
            {result.status === 403 ? 'Your role does not have permission to view company settings.' : 'Company profile not found.'}
          </p>
        </AdminPanel>
      )}
    </>
  );
}

function Detail({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{label}</dt>
      <dd className="text-sm text-ink-soft">{value}</dd>
    </div>
  );
}