'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ServiceFormDialog } from './ServiceFormDialog';

/**
 * Client-side data table.
 *
 * Used by the admin list pages. Sorting and searching happen on the server via
 * query parameters, not in memory — that keeps the Server Component model intact
 * and means pagination reflects the full filtered set rather than one page of it.
 */
export function DataTable({ columns, rows, caption, empty = null }) {
  if (!rows?.length) return empty;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}

        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'border-b border-line px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-ink-subtle',
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-surface-muted">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'border-b border-line px-4 py-3 text-ink-soft',
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                  )}
                >
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Edit trigger for a service. */
export function ServiceEditTrigger({ record }) {
  return <ServiceFormDialog service={record} triggerLabel="Edit" />;
}

export { useState, useRouter, cn };
export default DataTable;