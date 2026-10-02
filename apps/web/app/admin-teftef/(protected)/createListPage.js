import { adminData, toQuery } from './lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { AdminToolbar, AdminPagination, TableEmpty } from '@/components/admin/AdminTableParts';
import { DeleteButton, PublishToggle } from '@/components/admin/DeleteButton';
import { DateCell, BooleanBadge, MoneyCell } from '@/components/admin/Badge';
import { TableWrapper, Th, Td } from '@/components/admin/AdminUI';

/**
 * Generic admin list page factory.
 *
 * The admin has nine modules that are structurally identical: a searchable,
 * filterable, paginated table with create, edit, publish and delete. Writing each
 * one by hand produced nine near-identical files that had to be kept in sync by
 * hand — which is how they drift apart.
 *
 * This factory takes the differences (which columns to show, which permission
 * guards it, what the form looks like) and returns a page. Anything genuinely
 * unusual — the dashboard, finance reports, the company settings form — is written
 * out by hand instead.
 *
 * Config shape:
 *   {
 *     title, description, resource, permission, permissionFor,
 *     columns: [{ key, header, kind, align }],
 *     searchFields, filters, sortable, publishable, itemName, icon
 *   }
 */

const KINDS = {
  // Renders the cell value itself. A missing value becomes an em dash, and an
  // object (a mis-keyed association) degrades to its name/title rather than
  // crashing the table with "Objects are not valid as a React child".
  text: ({ value }) => {
    if (value === null || value === undefined || value === '') return <span className="text-ink-subtle">—</span>;
    if (typeof value === 'object') return String(value.name || value.title || value.label || '');
    return String(value);
  },
  // A primary cell with a secondary line beneath it.
  primary: ({ value, record, secondary }) => (
    <>
      <span className="font-medium text-ink">{value}</span>
      {secondary ? <span className="mt-0.5 block text-xs text-ink-subtle">{secondary}</span> : null}
    </>
  ),
  secondary: ({ value }) =>
    value ? <span className="mt-0.5 block text-xs text-ink-subtle">{value}</span> : <span className="text-ink-subtle">—</span>,
  status: ({ value, kind }) => <StatusFor status={value} entityKind={kind} />,
  publish: ({ value }) => <BooleanBadge value={value} trueLabel="Public" falseLabel="Hidden" />,
  date: ({ value }) => <DateCell value={value} />,
  boolean: ({ value }) => <BooleanBadge value={value} />,
  money: ({ value }) => <MoneyCell amount={value} />,
  link: ({ value, href, children }) =>
    value ? (
      <a href={href} className="text-brand-600 hover:underline">
        {children || 'View'}
      </a>
    ) : (
      <span className="text-ink-subtle">—</span>
    ),
};

// Imported separately so the module boundary stays clear.
import { StatusBadge as StatusFor } from '@/components/admin/Badge';

export function createAdminListPage(config) {
  const {
    title,
    description,
    resource,
    permission,
    permissionFor = 'write',
    columns,
    searchPlaceholder,
    filters = [],
    publishable = false,
    itemName = 'record',
    icon,
    form,
    defaultSort,
    defaultOrder = 'DESC',
    pageSize = 20,
  } = config;

  async function Page({ searchParams }) {
    await requirePermission(permission);

    const params = await searchParams;

    const result = await adminData(
      `/${resource}${toQuery({
        page: params?.page,
        pageSize,
        search: params?.search,
        sort: params?.sort || defaultSort,
        order: params?.order || defaultOrder,
        ...Object.fromEntries(filters.map((filter) => [filter.name, params?.[filter.name]])),
      })}`,
    );

    const rows = result.data || [];

    const hasFilters = Boolean(params?.search || filters.some((filter) => params?.[filter.name]));

    return (
      <>
        <AdminHeader
          title={title}
          description={description}
          action={form ? <form.Trigger /> : null}
        />

        <AdminPanel dense>
          <AdminToolbar
            basePath={`/admin-teftef/${resource === 'portfolio' ? 'portfolio' : resource}`}
            searchPlaceholder={searchPlaceholder || 'Search'}
            currentSearch={params?.search || ''}
            filters={filters}
            currentFilters={Object.fromEntries(filters.map((filter) => [filter.name, params?.[filter.name] || '']))}
          />

          {rows.length ? (
            <>
              <TableWrapper>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <Th key={column.key} align={column.align || 'left'}>
                        {column.header}
                      </Th>
                    ))}
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((record) => (
                    <tr key={record.id} className="transition-colors hover:bg-surface-muted">
                      {columns.map((column) => {
                        const render = KINDS[column.kind || 'text'] || KINDS.text;
                        const secondary =
                          typeof column.secondary === 'function' ? column.secondary(record) : column.secondary;

                        return (
                          <Td key={column.key} align={column.align || 'left'}>
                            {render({
                              record,
                              value: typeof column.key === 'function' ? column.key(record) : record[column.key],
                              secondary,
                              kind: column.entityKind,
                              href: column.href ? column.href(record) : undefined,
                              children: column.linkLabel,
                            })}
                          </Td>
                        );
                      })}

                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          {publishable ? (
                            <PublishToggle resource={resource} id={record.id} published={record.isPublished} itemName={itemName} />
                          ) : null}

                          {form ? <form.EditTrigger record={record} /> : null}

                          <DeleteButton resource={resource} id={record.id} label={record.name || record.title} itemName={itemName} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>

              <AdminPagination meta={result.meta} basePath={`/admin-teftef/${resource}`} />
            </>
          ) : (
            <TableEmpty
              icon={icon}
              hasFilters={hasFilters}
              title={hasFilters ? 'Nothing matches those filters' : `No ${itemName}s yet`}
              description={
                hasFilters
                  ? 'Try a different search term or clear the filters.'
                  : `Add your first ${itemName} here. Nothing appears on the website until you publish it.`
              }
            />
          )}
        </AdminPanel>
      </>
    );
  }

  Page.displayName = `AdminList(${resource})`;

  return Page;
}

export default createAdminListPage;