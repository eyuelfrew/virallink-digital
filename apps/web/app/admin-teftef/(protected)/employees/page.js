import Link from 'next/link';
import { adminData, toQuery, getDepartments } from '../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel, TableWrapper, Th, Td } from '@/components/admin/AdminUI';
import { StatusBadge, DateCell, BooleanBadge } from '@/components/admin/Badge';
import { AdminToolbar, TableEmpty } from '@/components/admin/AdminTableParts';
import { EmployeeFormDialog } from '@/components/admin/EmployeeFormDialog';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { EmptyState } from '@/components/site/Card';
import { UserRound } from 'lucide-react';

/**
 * Employee management.
 *
 * The publish column is the most important control on this page: an employee is
 * invisible to the website until `isPublic` is set. Private HR fields (email,
 * phone, joining date) are editable here and never leave the admin.
 */
export const metadata = { title: 'Employees' };

export default async function EmployeesPage({ searchParams }) {
  await requirePermission('employee.read');

  const params = await searchParams;

  const result = await adminData(`/employees${toQuery({
    page: params?.page,
    pageSize: 20,
    search: params?.search,
    status: params?.status,
    sort: params?.sort,
    order: params?.order,
  })}`);

  const employees = result.data || [];

  return (
    <>
      <AdminHeader
        title="Employees"
        description="Only employees marked as public appear on the website."
        action={
          <EmployeeFormDialog departments={result.departments || []} triggerLabel="Add employee" />
        }
      />

      <AdminPanel dense>
        <AdminToolbar
          basePath="/admin-teftef/employees"
          searchPlaceholder="Search by name or position"
          currentSearch={params?.search || ''}
          filters={[
            {
              name: 'status',
              label: 'All statuses',
              options: [
                { value: 'active', label: 'Active' },
                { value: 'on_leave', label: 'On leave' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
          ]}
          currentFilters={{ status: params?.status || '' }}
        />

        {employees.length ? (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Position</Th>
                <Th>Status</Th>
                <Th>Visible on site</Th>
                <Th>Joined</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>

            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="transition-colors hover:bg-surface-muted">
                  <Td>
                    <span className="font-medium text-ink">{employee.name}</span>
                    {employee.department?.name ? (
                      <span className="mt-0.5 block text-xs text-ink-subtle">
                        {employee.department.name}
                      </span>
                    ) : null}
                  </Td>

                  <Td>
                    {employee.position || <span className="text-ink-subtle">—</span>}
                    {employee.email ? (
                      <span className="mt-0.5 block text-xs text-ink-subtle">{employee.email}</span>
                    ) : null}
                  </Td>

                  <Td>
                    <StatusBadge status={employee.employmentStatus} kind="employee" />
                  </Td>

                  <Td>
                    <BooleanBadge value={employee.isPublic} trueLabel="Public" falseLabel="Hidden" />
                  </Td>

                  <Td>
                    <DateCell value={employee.joinedAt} />
                  </Td>

                  <Td align="right">
                    <div className="flex items-center justify-end gap-2">
                      <EmployeeFormDialog
                        employee={employee}
                        departments={result.departments || []}
                        triggerLabel="Edit"
                      />

                      <DeleteButton
                        resource="employees"
                        id={employee.id}
                        label={employee.name}
                        itemName="employee"
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        ) : (
          <TableEmpty
            icon={UserRound}
            hasFilters={Boolean(params?.search || params?.status)}
            title="No employees yet"
            description="Add your team here. They stay private until you mark each one as public."
          />
        )}
      </AdminPanel>

      <div className="mt-4 flex justify-center">
        <Link
          href={`/admin-teftef/employees?page=${Math.max(1, (result.meta.page || 1) - 1)}`}
          className="text-sm text-ink-muted hover:underline"
        >
          Previous
        </Link>
      </div>
    </>
  );
}

export { EmptyState };