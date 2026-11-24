import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel, TableWrapper, Th, Td } from '@/components/admin/AdminUI';
import { TasksViewToggle } from '@/components/admin/TasksViewToggle';
import { TaskPerformance } from '@/components/admin/TaskPerformance';
import { adminData } from '../../lib/adminData';

export const metadata = { title: 'Tasks · Performance' };

/**
 * Team performance.
 *
 * Its own route rather than a tab inside the table page, because it loads
 * different data: a counted and ranked summary rather than a page of rows.
 * That keeps the table page a plain list and the report a plain report.
 *
 * The period lives in the URL so a view can be shared and survives a refresh.
 */
const PERIODS = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'year', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
];

export default async function TaskPerformancePage({ searchParams }) {
  await requirePermission('task.read');

  const params = await searchParams;
  const requested = typeof params?.period === 'string' ? params.period : '30d';
  const period = PERIODS.some((option) => option.key === requested) ? requested : '30d';

  const result = await adminData(`/tasks/performance?period=${encodeURIComponent(period)}`);

  return (
    <>
      <AdminHeader
        title="Tasks"
        description="Who finished what, and how fast. Measured from the moment each task was closed."
        action={<TasksViewToggle view="performance" />}
      />

      <TaskPerformance
        data={result.data}
        period={period}
        periods={PERIODS}
        basePath="/vira-admin/tasks/performance"
      />
    </>
  );
}
