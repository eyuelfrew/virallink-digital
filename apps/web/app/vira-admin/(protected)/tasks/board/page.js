import { requirePermission } from '@/lib/auth';
import { AdminHeader } from '@/components/admin/AdminUI';
import { TaskFormDialog } from '@/components/admin/TaskFormDialog';
import { BOARD_FINISHED_DEFAULT, TasksBoard } from '@/components/admin/TasksBoard';
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

/**
 * The finished window the board asks for.
 *
 * Ten cards by default — enough to show work is getting done, few enough that
 * the column never buries the work that still needs attention. The board can
 * ask for a wider window, and the window it is showing lives in the URL, so
 * "show more" is a link anyone can share and nothing can fall out of step.
 *
 * The ceiling matches the API's, so a hand-typed URL cannot ask for more than
 * one read is willing to send.
 */
const FINISHED_MAX = 200;

function clampFinished(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const requested = Number(raw);

  if (!Number.isFinite(requested)) return BOARD_FINISHED_DEFAULT;

  return Math.min(Math.max(Math.floor(requested), 1), FINISHED_MAX);
}

export default async function TasksBoardPage({ searchParams }) {
  const session = await requirePermission('task.read');

  const params = await searchParams;
  const finished = clampFinished(params?.finished);

  const [board, employees] = await Promise.all([
    adminData(`/tasks/board?finished=${finished}`),
    loadEmployees(),
  ]);

  const permissions = session.permissions || [];

  return (
    <>
      <AdminHeader
        title="Tasks"
        description="Drag a card between columns to move it, or use the menu on the card. The finished column shows the ten most recent — ask for more, or open the list for the whole history."
        action={
          <>
            <TasksViewToggle view="board" />
            <TaskFormDialog employees={employees} triggerLabel="Add task" />
          </>
        }
      />

      <TasksBoard
        initial={board.data?.tasks || []}
        finishedTotal={board.data?.finishedTotal || 0}
        finishedLimit={finished}
        employees={employees}
        canWrite={permissions.includes('task.write')}
        canDelete={permissions.includes('task.delete')}
      />
    </>
  );
}
