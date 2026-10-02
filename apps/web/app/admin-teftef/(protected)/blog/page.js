import { createAdminListPage } from '../createListPage';
import { BlogFormDialog } from '@/components/admin/BlogFormDialog';
import { StatusBadge } from '@/components/admin/Badge';
import { Newspaper } from 'lucide-react';

export const metadata = { title: 'Blog' };

const Page = createAdminListPage({
  title: 'Blog',
  description: 'Published articles appear on the website with their own pages.',
  resource: 'blog',
  permission: 'blog.read',
  itemName: 'article',
  icon: Newspaper,
  searchPlaceholder: 'Search by title',
  publishable: true,
  defaultSort: 'publishedAt',
  defaultOrder: 'DESC',
  form: {
    Trigger: () => <BlogFormDialog triggerLabel="Add article" />,
    EditTrigger: ({ record }) => <BlogFormDialog post={record} triggerLabel="Edit" />,
  },
  columns: [
    { key: 'title', header: 'Title', kind: 'primary', secondary: (record) => record.excerpt },
    { key: 'status', header: 'Status', kind: 'status', entityKind: 'generic' },
    { key: 'publishedAt', header: 'Published', kind: 'date' },
    { key: (record) => record.author?.name, header: 'Author', kind: 'secondary' },
  ],
});

export default Page;