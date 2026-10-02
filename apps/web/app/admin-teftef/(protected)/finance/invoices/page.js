import { createAdminListPage } from '../../createListPage';
import { InvoiceFormDialog } from '@/components/admin/InvoiceFormDialog';
import { StatusBadge, MoneyCell } from '@/components/admin/Badge';
import { ReceiptText } from 'lucide-react';

export const metadata = { title: 'Invoices' };

const Page = createAdminListPage({
  title: 'Invoices',
  description: 'Invoices with line items, payments and outstanding balances.',
  resource: 'finance/invoices',
  permission: 'finance.read',
  itemName: 'invoice',
  icon: ReceiptText,
  searchPlaceholder: 'Search by invoice number',
  defaultSort: 'issueDate',
  defaultOrder: 'DESC',
  form: {
    Trigger: () => <InvoiceFormDialog triggerLabel="Add invoice" />,
    EditTrigger: ({ record }) => <InvoiceFormDialog invoice={record} triggerLabel="Edit" />,
  },
  columns: [
    { key: 'invoiceNumber', header: 'Invoice', kind: 'primary', secondary: (record) => record.client?.name },
    { key: 'total', header: 'Total', kind: 'money', align: 'right' },
    { key: 'status', header: 'Status', kind: 'status', entityKind: 'invoice' },
    { key: 'dueDate', header: 'Due', kind: 'date' },
    { key: 'issueDate', header: 'Issued', kind: 'date' },
  ],
});

export default Page;