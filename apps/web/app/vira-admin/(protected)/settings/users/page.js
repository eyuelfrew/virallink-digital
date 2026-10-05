import { adminData } from '../../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel, TableWrapper, Th, Td } from '@/components/admin/AdminUI';
import { UserFormDialog } from '@/components/admin/UserFormDialog';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { DateCell, BooleanBadge } from '@/components/admin/Badge';

export const metadata = { title: 'Users & roles' };

/**
 * User and role administration.
 *
 * Roles are listed read-only. The four system roles and their permission grants
 * are seeded and referenced by name in code, so an editable grant matrix here
 * would let a change silently disable an endpoint — `FINANCE` losing
 * `finance.read` looks identical to "nobody has opened finance this month".
 * Changing grants belongs in the seeder, where the diff is reviewable.
 *
 * Each account is a row in the list rather than a separate page, because the
 * useful question is "who can reach what", which is a question about the set.
 */
export default async function UsersSettingsPage() {
  const session = await requirePermission('user.read');

  const [usersResult, rolesResult] = await Promise.all([
    adminData('/users?pageSize=100'),
    adminData('/roles').catch(() => ({ data: [] })),
  ]);

  const users = usersResult.data || [];
  const roles = rolesResult.data || [];

  const roleName = (key) => roles.find((role) => role.key === key)?.name || key;

  return (
    <>
      <AdminHeader
        title="Users & roles"
        description="Who can sign in to this console, and what each role is permitted to do."
        action={<UserFormDialog roles={roles} triggerLabel="Add user" />}
      />

      <div className="flex flex-col gap-4">
        <AdminPanel dense>
          <TableWrapper>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => {
                const isSelf = Number(user.id) === Number(session.id);

                return (
                  <tr key={user.id} className="transition-colors hover:bg-surface-muted">
                    <Td>
                      <span className="font-medium text-ink">{user.name}</span>
                      <span className="mt-0.5 block text-xs text-ink-subtle">{user.email}</span>
                    </Td>

                    <Td>
                      <span className="text-sm text-ink-soft">
                        {(user.roles || []).map(roleName).join(', ') || '—'}
                      </span>
                    </Td>

                    <Td>
                      {/* A locked-out account is reported as such rather than as
                          merely inactive, because the fix is different. */}
                      {user.lockedUntil && new Date(user.lockedUntil) > new Date() ? (
                        <span className="text-xs font-medium text-danger">Locked</span>
                      ) : (
                        <BooleanBadge value={user.isActive} trueLabel="Active" falseLabel="Disabled" />
                      )}
                    </Td>

                    <Td>
                      <DateCell value={user.lastLoginAt} />
                    </Td>

                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        <UserFormDialog user={user} roles={roles} triggerLabel="Edit" />

                        {/* The API refuses to delete your own account and refuses to
                            remove the last super administrator. Hiding the button
                            for the current user saves a round trip to be told no. */}
                        {!isSelf ? (
                          <DeleteButton
                            resource="users"
                            id={user.id}
                            label={user.email}
                            itemName="user"
                          />
                        ) : (
                          <span className="text-xs text-ink-subtle">This is you</span>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrapper>
        </AdminPanel>

        <AdminPanel title="Roles" description="Seeded and referenced in code, so grants are edited in the seeder rather than here.">
          <TableWrapper>
            <thead>
              <tr>
                <Th>Role</Th>
                <Th>Key</Th>
                <Th align="right">Permissions</Th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.key}>
                  <Td>
                    <span className="font-medium text-ink">{role.name}</span>
                    {role.description ? (
                      <span className="mt-0.5 block text-xs text-ink-subtle">{role.description}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <code className="text-xs text-ink-muted">{role.key}</code>
                  </Td>
                  <Td align="right">
                    <span className="text-sm text-ink-soft">{role.permissionCount}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </AdminPanel>
      </div>
    </>
  );
}