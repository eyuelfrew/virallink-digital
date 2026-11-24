import Image from 'next/image';
import { createAdminListPage } from '../createListPage';
import { ClientFormDialog } from '@/components/admin/ClientFormDialog';

export const metadata = { title: 'Clients' };

/**
 * Whether this person may upload a logo.
 *
 * The logo is an image, so it goes through the media library and needs
 * `media.write` — a role that may edit clients but not upload files is offered
 * the field without the upload button rather than being shown a button that
 * would fail.
 */
function uploadProps(_extra, session) {
  return { canUpload: Boolean(session?.permissions?.includes('media.write')) };
}

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
    Trigger: ({ canUpload }) => <ClientFormDialog triggerLabel="Add client" canUpload={canUpload} />,
    EditTrigger: ({ record, canUpload }) => (
      <ClientFormDialog client={record} triggerLabel="Edit" canUpload={canUpload} />
    ),
    triggerProps: uploadProps,
    editProps: uploadProps,
  },
  columns: [
    {
      key: 'name',
      header: 'Client',
      // The logo sits beside the name in the list too, so an administrator can
      // see at a glance which client has a logo and which one is about to appear
      // on the website as a name only.
      render: (record) => (
        <div className="flex items-center gap-3">
          <ClientThumb client={record} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{record.name}</span>
            {record.contactPerson ? (
              <span className="mt-0.5 block truncate text-xs text-ink-subtle">{record.contactPerson}</span>
            ) : null}
          </span>
        </div>
      ),
    },
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

/**
 * The client's logo, or a monogram when there is none.
 *
 * Logos are stored as media and served from `/media/<key>`, which this app
 * proxies to the API — so the URL is already same-origin and needs no
 * configuration here.
 */
function ClientThumb({ client }) {
  if (client.logo?.url) {
    return (
      <Image
        src={client.logo.url}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-md border border-line bg-surface object-contain p-1"
      />
    );
  }

  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface-muted text-xs font-bold tracking-tight text-ink-muted">
      {monogram(client.name)}
    </span>
  );
}

/** 'Genet Hotel' -> 'GH'. */
function monogram(name) {
  const words = String(name || '')
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return '?';

  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default Page;
