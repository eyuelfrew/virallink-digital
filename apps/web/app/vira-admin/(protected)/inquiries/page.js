import Link from 'next/link';
import { createAdminListPage } from '../createListPage';

export const metadata = { title: 'Inquiries' };

const Page = createAdminListPage({
  title: 'Inquiries',
  description: 'Messages submitted through the public contact form.',
  resource: 'inquiries',
  permission: 'inquiry.read',
  itemName: 'inquiry',
  icon: 'Inbox',
  searchPlaceholder: 'Search by name, email or subject',
  defaultSort: 'createdAt',
  defaultOrder: 'DESC',
  columns: [
    {
      key: 'name',
      header: 'From',
      render: (record) => (
        <Link href={`/vira-admin/inquiries/${record.id}`} className="group block hover:underline">
          <span className="font-medium text-ink group-hover:text-brand-600">{record.name || 'Unnamed inquiry'}</span>
          <span className="mt-0.5 block text-xs text-ink-subtle">{record.company || record.email || ''}</span>
        </Link>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (record) => (
        <Link href={`/vira-admin/inquiries/${record.id}`} className="text-ink-soft hover:text-brand-600 hover:underline">
          {record.subject || '—'}
        </Link>
      ),
    },
    { key: 'status', header: 'Status', kind: 'status', entityKind: 'inquiry' },
    { key: 'isRead', header: 'Read', kind: 'boolean' },
    { key: 'createdAt', header: 'Received', kind: 'date' },
  ],
});

export default Page;