import Link from 'next/link';
import { adminData } from '../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { ContentBoard } from '@/components/admin/ContentBoard';
import { NewContentCardDialog } from '@/components/admin/NewContentCardDialog';

export const metadata = { title: 'Content pipeline' };

const TABS = [
  { label: 'Board', href: '/vira-admin/content' },
  { label: 'Weekly report', href: '/vira-admin/content/weekly' },
  { label: 'Proposals', href: '/vira-admin/content/proposals' },
];

/**
 * The production board.
 *
 * A Server Component that fetches the board and hands it to the client component
 * that owns dragging. Split this way so the board data is fetched server-side with
 * the admin's httpOnly cookie - the browser never sees a token, and the page works
 * on first paint without a client-side data fetch.
 *
 * `client` in the query string filters the board to one client, which is how you
 * answer "what is happening for Acme" without reading every card.
 */
export default async function ContentPipelinePage({ searchParams }) {
  const session = await requirePermission('content.read');

  const params = await searchParams;
  const clientId = params?.client ? Number(params.client) : undefined;

  const [boardResult, clientsResult] = await Promise.all([
    adminData(`/content/board${clientId ? `?clientId=${clientId}` : ''}`).catch(() => ({ data: null })),
    adminData('/content/clients').catch(() => ({ data: [] })),
  ]);

  const board = boardResult.data;
  const clients = clientsResult.data || [];

  const canWrite = session.permissions?.includes('content.write');
  const week = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <>
      <AdminHeader
        title="Content pipeline"
        description="Everything in flight, from first idea to posted. Drag a card to move it."
        action={canWrite ? <NewContentCardDialog clients={clients} /> : null}
      />

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Production">
        {TABS.map((tab) => {
          const active = tab.href === '/vira-admin/content';
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? '-mb-px border-b-2 border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600'
                  : '-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {clients.length ? (
        <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Client lens
          </span>
          <a
            href="/vira-admin/content"
            aria-current={!clientId ? 'page' : undefined}
            className={
              !clientId
                ? 'shrink-0 rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm'
                : 'shrink-0 rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-ink-muted hover:border-brand-300 hover:text-ink'
            }
          >
            All clients
          </a>
          {clients.map((client) => (
            <a
              key={client.id}
              href={`/vira-admin/content?client=${client.id}`}
              aria-current={clientId === client.id ? 'page' : undefined}
              className={
                clientId === client.id
                  ? 'shrink-0 rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm'
                  : 'shrink-0 rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-ink-muted hover:border-brand-300 hover:text-ink'
              }
            >
              {client.name}
            </a>
          ))}
        </div>
      ) : null}

      {board ? (
        <ContentBoard
          board={board}
          clients={clients}
          canWrite={canWrite}
          week={week}
          currentEmployeeId={session.employeeId ?? null}
        />
      ) : (
        <AdminPanel>
          <p className="py-10 text-center text-sm text-ink-muted">
            The board could not be loaded. Check that the API is running.
          </p>
        </AdminPanel>
      )}
    </>
  );
}
