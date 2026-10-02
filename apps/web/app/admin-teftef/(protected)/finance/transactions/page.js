import { createAdminListPage } from '../../createListPage';
import { TransactionFormDialog } from '@/components/admin/TransactionFormDialog';
import { MoneyCell } from '@/components/admin/Badge';
import { ArrowLeftRight } from 'lucide-react';

export const metadata = { title: 'Transactions' };

const Page = createAdminListPage({
  title: 'Transactions',
  description: 'Income and expense records. All amounts are stored as DECIMAL, never floats.',
  resource: 'finance/transactions',
  permission: 'finance.read',
  itemName: 'transaction',
  icon: ArrowLeftRight,
  searchPlaceholder: 'Search by description or reference',
  defaultSort: 'transactionDate',
  defaultOrder: 'DESC',
  form: {
    Trigger: () => <TransactionFormDialog triggerLabel="Add transaction" />,
    EditTrigger: ({ record }) => <TransactionFormDialog transaction={record} triggerLabel="Edit" />,
  },
  columns: [
    { key: 'description', header: 'Description', kind: 'primary', secondary: (record) => record.reference },
    { key: 'type', header: 'Type' },
    { key: 'amount', header: 'Amount', kind: 'money', align: 'right' },
    { key: 'transactionDate', header: 'Date', kind: 'date' },
    { key: 'status', header: 'Status', kind: 'status', entityKind: 'transaction' },
  ],
});

export default Page;