import { createAdminListPage } from '../createListPage';
import { StatusBadge, DateCell } from '@/components/admin/Badge';
import { Inbox } from 'lucide-react';

export const metadata = { title: 'Inquiries' };

const Page = createAdminListPage({
  title: 'Inquiries',
  description: 'Messages submitted through the public contact form.',
  resource: 'inquiries',
  permission: 'inquiry.read',
  itemName: 'inquiry',
  icon: Inbox,
  searchPlaceholder: 'Search by name, email or subject',
  defaultSort: 'createdAt',
  defaultOrder: 'DESC',
  columns: [
    { key: 'name', header: 'From', kind: 'primary', secondary: (record) => record.company || record.email },
    { key: 'subject', header: 'Subject' },
    { key: 'status', header: 'Status', kind: 'status', entityKind: 'inquiry' },
    { key: 'isRead', header: 'Read', kind: 'boolean' },
    { key: 'createdAt', header: 'Received', kind: 'date' },
  ],
});

export default Page;