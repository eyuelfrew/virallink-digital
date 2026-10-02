import { createAdminListPage } from '../createListPage';
import { ProjectFormDialog } from '@/components/admin/ProjectFormDialog';
import { StatusBadge } from '@/components/admin/Badge';
import { FolderKanban } from 'lucide-react';

export const metadata = { title: 'Portfolio' };

const Page = createAdminListPage({
  title: 'Portfolio',
  description: 'Published projects appear on the website with their own pages.',
  resource: 'portfolio',
  permission: 'project.read',
  itemName: 'project',
  icon: FolderKanban,
  searchPlaceholder: 'Search by title',
  publishable: true,
  defaultSort: 'displayOrder',
  defaultOrder: 'ASC',
  form: {
    Trigger: () => <ProjectFormDialog triggerLabel="Add project" />,
    EditTrigger: ({ record }) => <ProjectFormDialog project={record} triggerLabel="Edit" />,
  },
  columns: [
    { key: 'title', header: 'Title', kind: 'primary', secondary: (record) => record.summary },
    { key: 'status', header: 'Status', kind: 'status', entityKind: 'project' },
    { key: 'isPublished', header: 'Published', kind: 'publish' },
    { key: 'isFeatured', header: 'Featured', kind: 'boolean' },
    { key: 'displayOrder', header: 'Order', align: 'right' },
  ],
});

export default Page;