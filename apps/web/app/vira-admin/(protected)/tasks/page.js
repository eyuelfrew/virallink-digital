import { createAdminListPage } from '../createListPage';
import { TaskFormDialog } from '@/components/admin/TaskFormDialog';
import { adminData } from '../lib/adminData';
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from '@virallink/shared/enums';

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
    return (result.data || []).map((employee) => ({ id: employee.id, name: employee.name }));
  } catch {
    return [];
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

  filters: [
    { name: 'status', label: 'All statuses', options: optionsFrom(TASK_STATUS_LABELS) },
    { name: 'priority', label: 'All priorities', options: optionsFrom(TASK_PRIORITY_LABELS) },
  ],

  form: {
    Trigger: ({ employees }) => <TaskFormDialog employees={employees} triggerLabel="Add task" />,
    EditTrigger: ({ record, employees }) => (
      <TaskFormDialog task={record} employees={employees} triggerLabel="Edit" />
    ),
    triggerProps: (extra) => ({ employees: extra?.employees || [] }),
    editProps: (extra) => ({ employees: extra?.employees || [] }),
  },

  columns: [
    {
      key: 'title',
      header: 'Task',
      kind: 'primary',
      secondary: (record) => {
        if (record.status === 'done') {
          return record.completedAt
            ? `Completed ${new Date(record.completedAt).toLocaleDateString('en-GB')}`
            : 'Completed';
        }
        if (isOverdue(record)) return 'Overdue';
        return record.description ? record.description.slice(0, 80) : null;
      },
    },
    { key: 'status', header: 'Status', kind: 'status', entityKind: 'generic' },
    { key: 'priority', header: 'Priority', kind: 'secondary' },
    { key: (record) => record.dueDate, header: 'Due', kind: 'secondary' },
    { key: (record) => record.assignee?.name, header: 'Assigned to', kind: 'secondary' },
  ],
});

export default Page;