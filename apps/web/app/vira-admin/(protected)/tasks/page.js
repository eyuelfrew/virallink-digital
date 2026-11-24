import { createAdminListPage } from '../createListPage';
import { TaskFormDialog } from '@/components/admin/TaskFormDialog';
import {
  AssigneeChip,
  DueCell,
  TASK_PRIORITY_BAR,
  TaskPriorityBadge,
  TaskStatusBadge,
} from '@/components/admin/Badge';
import { TasksViewToggle } from '@/components/admin/TasksViewToggle';
import { adminData } from '../lib/adminData';
import { cn } from '@/lib/utils';
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from '@/shared/enums';

export const metadata = { title: 'Tasks' };

/** A task is overdue when its due date has passed and it is not finished. */
function isOverdue(task) {
  if (!task.dueDate || task.status === 'done' || task.status === 'cancelled') return false;
  return new Date(task.dueDate) < new Date();
}

/**
 * Internal task board.
 *
 * Unlike the content modules, tasks are never published and never reach the
 * public site, so there is no publish column and no public read path.
 *
 * `load` is called by the factory with the search params and its result is handed
 * to the form dialog. It swallows its own failure: if the employee list cannot be
 * loaded the assignee picker is simply empty, which is recoverable, whereas
 * throwing would take the whole board down.
 */
async function loadEmployees() {
  try {
    const result = await adminData('/employees?pageSize=100');
    return {
      employees: (result.data || []).map((employee) => ({
        id: employee.id,
        name: employee.name,
      })),
    };
  } catch {
    return { employees: [] };
  }
}

/**
 * Turn a `{ KEY: 'Label' }` enum into the `{ value, label }` shape the toolbar
 * expects.
 *
 * Passing `Object.entries(...)` straight through looks equivalent and is not: it
 * yields `[key, label]` tuples, so every `option.value` and every React `key`
 * comes back `undefined` — which React reports as duplicate keys rather than as
 * the missing data it actually is.
 */
const optionsFrom = (labels) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/*
 * Defined OUTSIDE the config object on purpose.
 *
 * These were inline arrow functions inside the config, which meant every render
 * of the factory created a brand-new component reference. React treats a changed
 * component type as a different element: it unmounts the old subtree and mounts a
 * new one, which resets `open` back to its initial `false`. The visible result was
 * a button that appeared to do nothing — the dialog opened and closed within the
 * same commit, before a paint.
 *
 * Hoisting them to module scope gives them a stable identity, so the dialog's
 * state survives re-renders of the page around it.
 */
function AddTaskTrigger({ employees }) {
  return <TaskFormDialog employees={employees} triggerLabel="Add task" />;
}

function EditTaskTrigger({ record, employees }) {
  return <TaskFormDialog task={record} employees={employees} triggerLabel="Edit" />;
}

/** The line beneath a task title: how it ended, or what it is about. */
function titleDetail(task) {
  if (task.status === 'done') {
    return task.completedAt
      ? `Completed ${new Date(task.completedAt).toLocaleDateString('en-GB')}`
      : 'Completed';
  }
  if (task.status === 'cancelled') return 'Cancelled';
  if (isOverdue(task)) return 'Overdue';
  return task.description ? task.description.slice(0, 80) : null;
}

/**
 * Task title cell.
 *
 * A colour-coded bar down the left of the title reads the priority without you
 * having to find the priority column — the busiest tasks pull the eye first.
 */
function TaskTitle({ task }) {
  const detail = titleDetail(task);

  return (
    <div className="flex items-start gap-3">
      <span
        className={cn('mt-0.5 h-8 w-1 shrink-0 rounded-sm', TASK_PRIORITY_BAR[task.priority] || 'bg-line')}
        aria-hidden="true"
      />

      <div className="min-w-0">
        <span className="font-medium text-ink">{task.title}</span>
        {detail ? <span className="mt-0.5 block text-xs text-ink-subtle">{detail}</span> : null}
      </div>
    </div>
  );
}

const Page = createAdminListPage({
  title: 'Tasks',
  description: 'Internal work items. Never shown on the public website.',
  resource: 'tasks',
  permission: 'task.read',
  itemName: 'task',
  icon: 'ListTodo',
  searchPlaceholder: 'Search tasks',
  defaultSort: 'createdAt',
  defaultOrder: 'DESC',
  load: loadEmployees,
  headerActions: <TasksViewToggle view="table" />,

  filters: [
    { name: 'status', label: 'All statuses', options: optionsFrom(TASK_STATUS_LABELS) },
    { name: 'priority', label: 'All priorities', options: optionsFrom(TASK_PRIORITY_LABELS) },
  ],

  form: {
    Trigger: AddTaskTrigger,
    EditTrigger: EditTaskTrigger,
    triggerProps: (extra) => ({ employees: extra?.employees || [] }),
    editProps: (extra) => ({ employees: extra?.employees || [] }),
  },

  columns: [
    { id: 'title', header: 'Task', render: (task) => <TaskTitle task={task} /> },
    { id: 'status', header: 'Status', render: (task) => <TaskStatusBadge status={task.status} /> },
    { id: 'priority', header: 'Priority', render: (task) => <TaskPriorityBadge priority={task.priority} /> },
    { id: 'due', header: 'Due', render: (task) => <DueCell value={task.dueDate} status={task.status} /> },
    { id: 'assignee', header: 'Assigned to', render: (task) => <AssigneeChip name={task.assignee?.name} /> },
  ],
});

export default Page;