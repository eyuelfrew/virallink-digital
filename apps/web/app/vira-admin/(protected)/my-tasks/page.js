import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { adminData } from '../lib/adminData';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { MyTasksBoard } from '@/components/admin/MyTasksBoard';
import { EmptyState } from '@/components/site/Card';
import { AlertTriangle, Link2, ListChecks } from 'lucide-react';

export const metadata = { title: 'My tasks' };

/**
 * "My tasks" — the employee-facing view.
 *
 * Guarded by `requireSession` rather than a permission: everything on this
 * page is the caller's own work, resolved server-side by the API from the
 * employee link on their session. There is no parameter that chooses whose
 * tasks are shown, so there is nothing a permission gate would protect that
 * the session itself does not already.
 *
 * Three states, all first-class:
 *   - API unreachable  → a plain failure notice, never an error boundary
 *   - account unlinked → explains exactly who can fix it and where
 *   - linked           → the board
 */
export default async function MyTasksPage() {
  const session = await requireSession();
  const canWrite = session.permissions?.includes('task.write');
  const canManageUsers = session.permissions?.includes('user.read');

  const result = await adminData('/tasks/mine');

  if (!result.ok) {
    return (
      <>
        <AdminHeader title="My tasks" description="Work assigned to you." />
        <AdminPanel>
          <EmptyState
            icon={AlertTriangle}
            title="Your tasks could not be loaded"
            description={
              result.status === 401
                ? 'Your session has ended. Sign in again to continue.'
                : 'The management service did not respond. Try again in a moment.'
            }
          />
        </AdminPanel>
      </>
    );
  }

  const data = result.data;

  if (!data?.linked) {
    return (
      <>
        <AdminHeader title="My tasks" description="Work assigned to you." />
        <AdminPanel>
          <EmptyState
            icon={Link2}
            title="This account isn't linked to an employee profile"
            description={
              canManageUsers
                ? 'Tasks are assigned to employee records. Link this sign-in to a profile in Settings → Users, and everything assigned to that person will appear here.'
                : 'Tasks are assigned to employee records. Ask an administrator to link your sign-in to your employee profile in Settings → Users — then your work will appear here.'
            }
          />
          {canManageUsers ? (
            <p className="mt-4 text-center">
              <Link
                href="/vira-admin/settings/users"
                className="text-sm font-semibold text-brand-600 underline-offset-4 hover:underline"
              >
                Open Users &amp; roles
              </Link>
            </p>
          ) : null}
        </AdminPanel>
      </>
    );
  }

  if (!data.tasks.length) {
    return (
      <>
        <AdminHeader
          title="My tasks"
          description={`Nothing is assigned to ${data.employee.name} right now.`}
        />
        <AdminPanel>
          <EmptyState
            icon={ListChecks}
            title="All caught up"
            description="When a task is assigned to you it appears here, grouped by where it is in the workflow."
          />
        </AdminPanel>
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title="My tasks"
        description={`Everything assigned to ${data.employee.name}, from to-do to finished.`}
      />
      <MyTasksBoard initial={data} canWrite={canWrite} />
    </>
  );
}
