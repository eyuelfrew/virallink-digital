import { adminData } from '../../lib/adminData';
import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel, StatCard, TableWrapper, Th, Td } from '@/components/admin/AdminUI';
import { DateCell, MoneyCell } from '@/components/admin/Badge';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { ProposalFormDialog } from '@/components/admin/ProposalFormDialog';
import { PROPOSAL_STATUS_LABELS } from '@/shared/enums';

export const metadata = { title: 'Proposals' };

/**
 * Ideas, plans and proposals put to clients.
 *
 * Upstream of the pipeline, not inside it. A proposal is a pitch; only an accepted
 * one becomes content. Keeping them separate stops "we pitched this" cluttering the
 * board with work that was never signed off.
 *
 * `awaiting` is the number that matters here — a proposal sent and never answered
 * is the most common way agency revenue quietly stops.
 */
export default async function ProposalsPage() {
  const session = await requirePermission('content.read');

  const [proposalsResult, summaryResult, clientsResult] = await Promise.all([
    adminData('/proposals').catch(() => ({ data: [] })),
    adminData('/proposals/summary').catch(() => ({ data: null })),
    adminData('/clients?pageSize=100').catch(() => ({ data: [] })),
  ]);

  const proposals = proposalsResult.data || [];
  const summary = summaryResult.data;
  const clients = clientsResult.data || [];
  const canWrite = session.permissions?.includes('content.write');

  return (
    <>
      <AdminHeader
        title="Proposals"
        description="Ideas, plans and packages put to clients."
        action={canWrite ? <ProposalFormDialog clients={clients} triggerLabel="New proposal" /> : null}
      />

      <div className="flex flex-col gap-4">
        {summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total" value={summary.total} />
            {Object.entries(PROPOSAL_STATUS_LABELS).map(([key, label]) => (
              <StatCard key={key} label={label} value={summary.byStatus[key] || 0} />
            ))}
          </div>
        ) : null}

        <AdminPanel dense>
          {proposals.length ? (
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Proposal</Th>
                  <Th>Client</Th>
                  <Th>Status</Th>
                  <Th align="right">Value</Th>
                  <Th>Answered</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => (
                  <tr key={proposal.id} className="transition-colors hover:bg-surface-muted">
                    <Td>
                      <span className="font-medium text-ink">{proposal.title}</span>
                      {proposal.scope ? (
                        <span className="mt-0.5 block text-xs text-ink-subtle">{proposal.scope}</span>
                      ) : null}
                    </Td>
                    <Td>
                      <span className="text-sm text-ink-soft">{proposal.clientName || '—'}</span>
                    </Td>
                    <Td>
                      {/* A sent proposal with no answer is the one worth chasing,
                          so it reads differently from a closed one. */}
                      {proposal.status === 'sent' ? (
                        <span className="text-xs font-medium text-amber-700">Awaiting reply</span>
                      ) : (
                        <span className="text-sm text-ink-soft">
                          {PROPOSAL_STATUS_LABELS[proposal.status] || proposal.status}
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      {proposal.value ? <MoneyCell amount={proposal.value} /> : <span className="text-ink-subtle">—</span>}
                    </Td>
                    <Td>
                      <DateCell value={proposal.respondedAt} />
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        {canWrite ? (
                          <ProposalFormDialog
                            proposal={proposal}
                            clients={clients}
                            triggerLabel="Edit"
                          />
                        ) : null}
                        {canWrite ? (
                          <DeleteButton
                            resource="proposals"
                            id={proposal.id}
                            label={proposal.title}
                            itemName="proposal"
                          />
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>
          ) : (
            <p className="py-10 text-center text-sm text-ink-subtle">
              No proposals yet. Record what you have put to a client so it is not lost in a
              message thread.
            </p>
          )}
        </AdminPanel>
      </div>
    </>
  );
}