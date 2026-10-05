import { adminData } from '../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { ContentBoard } from '@/components/admin/ContentBoard';
import { NewContentCardDialog } from '@/components/admin/NewContentCardDialog';

export const metadata = { title: 'Content pipeline' };

/**
 * The production board.
 *
 * A Server Component that fetches the board and hands it to the client component
 * that owns dragging. Split this way so the board data is fetched server-side with
 * the admin's httpOnly cookie — the browser never sees a token, and the page works
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
    adminData('/clients?pageSize=100').catch(() => ({ data: [] })),
  ]);

  const board = boardResult.data;
  const clients = clientsResult.data || [];

  const canWrite = session.permissions?.includes('content.write');
  const week = board
    ? `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : undefined;

  return (
    <>
      <AdminHeader
        title="Content pipeline"
        description="Everything in flight, from first idea to posted. Drag a card to move it."
        action={canWrite ? <NewContentCardDialog clients={clients} /> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-subtle">Client</span>
        <a
          href="/vira-admin/content"
          className={
            !clientId
              ? 'rounded-md bg-brand-500 px-2 py-1 text-xs font-semibold text-white'
              : 'rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted'
          }
        >
          All clients
        </a>
        {clients.map((client) => (
          <a
            key={client.id}
            href={`/vira-admin/content?client=${client.id}`}
            className={
              clientId === client.id
                ? 'rounded-md bg-brand-500 px-2 py-1 text-xs font-semibold text-white'
                : 'rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted'
            }
          >
            {client.name}
          </a>
        ))}
      </div>

      {board ? (
        <ContentBoard board={board} clients={clients} canWrite={canWrite} week={week} />
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