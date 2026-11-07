import { requirePermission } from '@/lib/auth';
import { AdminHeader } from '@/components/admin/AdminUI';
import { TaskFormDialog } from '@/components/admin/TaskFormDialog';
import { TasksBoard } from '@/components/admin/TasksBoard';
import { TasksViewToggle } from '@/components/admin/TasksViewToggle';
import { adminData } from '../../lib/adminData';

export const metadata = { title: 'Tasks · Board' };

/**
 * Board view of the task module.
 *
 * Its own route rather than a toggle inside the table page: the two views load
 * different data (a whole board versus a filtered page), and a route keeps each
 * page a plain Server Component with no view-switching state.
 *
 * The employee list is loaded only for the edit dialog's assignee picker and
 * degrades to empty if it fails, matching the table page.
 */
async function loadEmployees() {
  try {
    const result = await adminData('/employees?pageSize=100');
    return (result.data || []).map((employee) => ({ id: employee.id, name: employee.name }));
  } catch {
    return [];
  }
}

export default async function TasksBoardPage() {
  const session = await requirePermission('task.read');

  const [board, employees] = await Promise.all([adminData('/tasks/board'), loadEmployees()]);

  const permissions = session.permissions || [];

  return (
    <>
      <AdminHeader
        title="Tasks"
        description="Drag a card between columns to move it, or use the menu on the card."
        action={
          <>
            <TasksViewToggle view="board" />
            <TaskFormDialog employees={employees} triggerLabel="Add task" />
          </>
        }
      />

      <TasksBoard
        initial={board.data?.tasks || []}
        employees={employees}
        canWrite={permissions.includes('task.write')}
        canDelete={permissions.includes('task.delete')}
      />
    </>
  );
}
