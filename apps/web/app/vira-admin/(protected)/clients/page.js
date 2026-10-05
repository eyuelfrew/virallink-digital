import { createAdminListPage } from '../createListPage';
import { ClientFormDialog } from '@/components/admin/ClientFormDialog';
import { StatusBadge } from '@/components/admin/Badge';

export const metadata = { title: 'Clients' };

const Page = createAdminListPage({
  title: 'Clients',
  description: 'Client records and their contact details. Private by default.',
  resource: 'clients',
  permission: 'client.read',
  itemName: 'client',
  icon: 'Building2',
  searchPlaceholder: 'Search by name, contact or industry',
  publishable: true,
  defaultSort: 'createdAt',
  form: {
    Trigger: () => <ClientFormDialog triggerLabel="Add client" />,
    EditTrigger: ({ record }) => <ClientFormDialog client={record} triggerLabel="Edit" />,
  },
  columns: [
    { key: 'name', header: 'Client', kind: 'primary', secondary: (record) => record.contactPerson },
    { key: 'industry', header: 'Industry' },
    { key: 'status', header: 'Status', kind: 'status', entityKind: 'client' },
    { key: 'isPublic', header: 'On website', kind: 'publish' },
    // The detail page is where notes, communications, deliverables and the report
    // live. Without this link the only route to a client is opening the Edit
    // dialog, which is the wrong tool for reading anything.
    {
      key: (record) => record.id,
      header: 'Detail',
      kind: 'link',
      href: (record) => `/vira-admin/clients/${record.id}`,
      linkLabel: 'View',
    },
    { key: 'createdAt', header: 'Added', kind: 'date' },
  ],
});

export default Page;