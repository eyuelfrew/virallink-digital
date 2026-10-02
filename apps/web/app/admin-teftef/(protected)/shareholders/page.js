import { createAdminListPage } from '../createListPage';
import { ShareholderFormDialog } from '@/components/admin/ShareholderFormDialog';
import { StatusBadge } from '@/components/admin/Badge';
import { PieChart } from 'lucide-react';

export const metadata = { title: 'Shareholders' };

const Page = createAdminListPage({
  title: 'Shareholders',
  description: 'Confidential ownership records. Never exposed on the public website.',
  resource: 'shareholders',
  permission: 'shareholder.read',
  itemName: 'shareholder',
  icon: PieChart,
  searchPlaceholder: 'Search by name',
  defaultSort: 'ownershipPercentage',
  defaultOrder: 'DESC',
  form: {
    Trigger: () => <ShareholderFormDialog triggerLabel="Add shareholder" />,
    EditTrigger: ({ record }) => <ShareholderFormDialog shareholder={record} triggerLabel="Edit" />,
  },
  columns: [
    { key: 'name', header: 'Name', kind: 'primary' },
    { key: 'shareClass', header: 'Class' },
    { key: 'shareCount', header: 'Shares', align: 'right' },
    { key: 'ownershipPercentage', header: 'Ownership', align: 'right' },
    { key: 'status', header: 'Status', kind: 'status', entityKind: 'shareholder' },
  ],
});

export default Page;