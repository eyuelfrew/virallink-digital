import { createAdminListPage } from '../createListPage';
import { adminData } from '../lib/adminData';
import { JobFormDialog } from '@/components/admin/JobFormDialog';
import { BooleanBadge } from '@/components/admin/Badge';

export const metadata = { title: 'Careers' };

/**
 * Careers admin — manage the vacancies shown on the public /careers page.
 *
 * The API already exposes jobs (job.write) and departments (employee.read), so
 * this page is a thin list over those endpoints. Publishing uses the shared
 * boolean `isPublished` field that jobs carry, so no custom resolver is needed.
 */
async function loadDepartments() {
  try {
    const result = await adminData('/departments?pageSize=100');
    const rows = result.data || [];
    return { departments: rows.map((department) => ({ id: department.id, name: department.name })) };
  } catch {
    return { departments: [] };
  }
}

/** Local calendar date as yyyy-mm-dd, matching a DATEONLY column and <input type="date">. */
function localDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function isExpired(closesAt) {
  return Boolean(closesAt && String(closesAt).slice(0, 10) < localDateString());
}

const Page = createAdminListPage({
  title: 'Careers',
  description: 'Open roles on the public careers page. Published roles with a past closing date are hidden automatically.',
  resource: 'jobs',
  // There is no job.read permission; job.write is the gate the API uses for reads too.
  permission: 'job.write',
  itemName: 'role',
  icon: 'Briefcase',
  searchPlaceholder: 'Search by title or location',
  publishable: true,
  defaultSort: 'displayOrder',
  defaultOrder: 'ASC',
  load: loadDepartments,
  form: {
    Trigger: ({ departments }) => <JobFormDialog departments={departments} triggerLabel="Add role" />,
    EditTrigger: ({ record, departments }) => (
      <JobFormDialog job={record} departments={departments} triggerLabel="Edit" />
    ),
    triggerProps: (extra) => ({ departments: extra?.departments || [] }),
    editProps: (extra) => ({ departments: extra?.departments || [] }),
  },
  columns: [
    { key: 'title', header: 'Role', kind: 'primary', secondary: (record) => record.employmentType || record.location },
    { key: (record) => record.department?.name, header: 'Department', kind: 'secondary' },
    { key: 'location', header: 'Location' },
    {
      key: 'closesAt',
      header: 'Closes',
      render: (record) => {
        if (!record.closesAt) return <span className="text-ink-subtle">No deadline</span>;
        const expired = String(record.closesAt).slice(0, 10) < localDateString();
        return (
          <span className={expired ? 'font-medium text-danger' : 'text-ink-soft'}>
            {String(record.closesAt).slice(0, 10)}
            {expired ? ' (expired)' : ''}
          </span>
        );
      },
    },
    {
      header: 'On site',
      render: (record) => (
        <BooleanBadge
          value={Boolean(record.isPublished) && !isExpired(record.closesAt)}
          trueLabel="Live"
          falseLabel="Hidden"
        />
      ),
    },
    { key: 'displayOrder', header: 'Order' },
  ],
});

export default Page;
