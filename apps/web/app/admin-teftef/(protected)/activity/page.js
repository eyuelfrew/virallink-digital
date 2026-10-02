import { adminData, toQuery } from '../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel, TableWrapper, Th, Td } from '@/components/admin/AdminUI';
import { AdminToolbar, AdminPagination } from '@/components/admin/AdminTableParts';
import { DateCell } from '@/components/admin/Badge';
import { History } from 'lucide-react';

export const metadata = { title: 'Activity log' };

export default async function ActivityPage({ searchParams }) {
  await requirePermission('activity.read');

  const params = await searchParams;

  const result = await adminData(`/activity${toQuery({
    page: params?.page,
    pageSize: 30,
    search: params?.search,
    action: params?.action,
    entity: params?.entity,
  })}`);

  const rows = result.data || [];

  return (
    <>
      <AdminHeader
        title="Activity log"
        description="Every action taken in the admin, with who did it and when."
      />

      <AdminPanel dense>
        <AdminToolbar
          basePath="/admin-teftef/activity"
          searchPlaceholder="Search by action, entity or user"
          currentSearch={params?.search || ''}
        />

        {rows.length ? (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>User</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-surface-muted">
                    <Td>
                      <span className="font-medium text-ink">{describeAction(entry.action)}</span>
                    </Td>
                    <Td>{entry.entity?.replace(/_/g, ' ')}</Td>
                    <Td>{entry.userEmail || '—'}</Td>
                    <Td><DateCell value={entry.createdAt} /></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>

            <AdminPagination meta={result.meta} basePath="/admin-teftef/activity" />
          </>
        ) : (
          <p className="py-8 text-center text-sm text-ink-muted">No activity recorded yet.</p>
        )}
      </AdminPanel>
    </>
  );
}

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