import { createAdminListPage } from '../createListPage';
import { ServiceFormDialog } from '@/components/admin/ServiceFormDialog';
import { StatusBadge } from '@/components/admin/Badge';

/**
 * Services.
 *
 * The clearest example of the data-driven requirement: adding a service here
 * creates /services/<slug> on the website and adds it to the sitemap, with no code
 * change and no redeploy.
 */
export const metadata = { title: 'Services' };

const Page = createAdminListPage({
  title: 'Services',
  description: 'Each published service gets its own page on the website.',
  resource: 'services',
  permission: 'service.read',
  itemName: 'service',
  icon: 'Briefcase',
  searchPlaceholder: 'Search by title',
  publishable: true,
  defaultSort: 'displayOrder',
  defaultOrder: 'ASC',
  form: { Trigger: () => <ServiceFormDialog triggerLabel="Add service" />, EditTrigger: ServiceEditTrigger },
  columns: [
    { key: 'title', header: 'Title', kind: 'primary', secondary: (record) => record.summary },
    { key: 'slug', header: 'URL', kind: 'secondary' },
    {
      key: 'isPublished',
      header: 'Status',
      kind: 'publish',
    },
    { key: 'displayOrder', header: 'Order', align: 'right' },
  ],
});

function ServiceEditTrigger({ record }) {
  return <ServiceFormDialog service={record} triggerLabel="Edit" />;
}

export default Page;