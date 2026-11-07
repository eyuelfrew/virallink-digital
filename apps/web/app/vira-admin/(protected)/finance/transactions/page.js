import { createAdminListPage } from '../../createListPage';
import { TransactionFormDialog } from '@/components/admin/TransactionFormDialog';
import { STATUS_LABELS, TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/shared/enums';

export const metadata = { title: 'Transactions' };

const typeOptions = [
  { value: TRANSACTION_TYPE.INCOME, label: 'Income' },
  { value: TRANSACTION_TYPE.EXPENSE, label: 'Expense' },
];

const statusOptions = Object.values(TRANSACTION_STATUS).map((status) => ({
  value: status,
  label: STATUS_LABELS[status] || status,
}));

const Page = createAdminListPage({
  title: 'Transactions',
  description: 'Income and expense records. All amounts are stored as DECIMAL, never floats.',
  resource: 'finance/transactions',
  permission: 'finance.read',
  itemName: 'transaction',
  icon: 'ArrowLeftRight',
  searchPlaceholder: 'Search by description or reference',
  defaultSort: 'transactionDate',
  defaultOrder: 'DESC',
  // All four are applied server-side (see `filters` handling in the factory) and
  // map onto the query parameters the finance endpoint already accepts.
  filters: [
    { name: 'type', label: 'All types', options: typeOptions },
    { name: 'status', label: 'All statuses', options: statusOptions },
    { name: 'from', label: 'From', type: 'date' },
    { name: 'to', label: 'To', type: 'date' },
  ],
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