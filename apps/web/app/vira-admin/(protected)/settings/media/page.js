import { adminData, toQuery } from '../../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel, TableWrapper, Th, Td } from '@/components/admin/AdminUI';
import { AdminToolbar, AdminPagination } from '@/components/admin/AdminTableParts';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { formatBytes } from '@/lib/utils';
import { Image } from 'lucide-react';

export const metadata = { title: 'Media library' };

export default async function MediaPage({ searchParams }) {
  await requirePermission('media.read');

  const params = await searchParams;

  const result = await adminData(`/media${toQuery({
    page: params?.page,
    pageSize: 24,
    search: params?.search,
    kind: params?.kind,
  })}`);

  const rows = result.data || [];

  return (
    <>
      <AdminHeader
        title="Media library"
        description="Uploaded images. Files are stored on disk, metadata in the database."
      />

      <AdminPanel dense>
        <AdminToolbar
          basePath="/vira-admin/settings/media"
          searchPlaceholder="Search by filename or alt text"
          currentSearch={params?.search || ''}
          filters={[
            {
              name: 'kind',
              label: 'All types',
              options: [
                { value: 'image', label: 'Images' },
                { value: 'document', label: 'Documents' },
              ],
            },
          ]}
          currentFilters={{ kind: params?.kind || '' }}
        />

        {rows.length ? (
          <>
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-4">
              {rows.map((media) => (
                <div key={media.id} className="group relative rounded-lg border border-line bg-surface">
                  <div className="relative aspect-square overflow-hidden rounded-t-lg bg-surface-sunken">
                    {media.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={media.url}
                        alt={media.altText || media.title || 'Media'}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <Image className="size-8 text-ink-subtle" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <p className="truncate text-sm font-medium text-ink">{media.title || media.key}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {media.width}×{media.height} · {formatBytes(media.sizeBytes)}
                    </p>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-ink-muted">{media.kind}</span>
                      <DeleteButton
                        resource="media"
                        id={media.id}
                        label={media.title || media.key}
                        itemName="file"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <AdminPagination meta={result.meta} basePath="/vira-admin/settings/media" />
          </>
        ) : (
          <p className="py-8 text-center text-sm text-ink-muted">
            No media uploaded yet. Use the upload button in any form that accepts images.
          </p>
        )}
      </AdminPanel>
    </>
  );
}