import { useState } from 'react'
import { Link } from 'react-router'

import { Spinner } from '../components/Spinner'
import { dateTime } from '../lib/time'
import { type AuditAction, useAudit } from './api'
import { ActionChip, Card, Empty, PanelHeader } from './shared'
import { ACTION_LABELS, auditDetail, auditSubject } from './text'

const ACTIONS: AuditAction[] = ['verify', 'reject', 'clear', 'merge', 'suspend', 'reinstate', 'role']

/** Every moderator action, newest first: who did what, to which report or account, and the outcome. */
export function AuditPage() {
  const [action, setAction] = useState<AuditAction | null>(null)
  const audit = useAudit(action)
  const entries = audit.data?.pages.flat() ?? []

  return (
    <>
      <PanelHeader title="Audit log" subtitle="A permanent record of every decision moderators make on reports and accounts.">
        <label className="flex items-center gap-2 text-body-md text-text-secondary">
          Show
          <select value={action ?? ''} onChange={(e) => setAction((e.target.value || null) as AuditAction | null)}
            className="h-9 rounded-md border border-border-muted bg-surface-container-lowest px-2.5 text-body-md text-on-surface">
            <option value="">All actions</option>
            {ACTIONS.map((value) => <option key={value} value={value}>{ACTION_LABELS[value]}</option>)}
          </select>
        </label>
      </PanelHeader>

      <Card className="overflow-hidden">
        {audit.isPending && <div className="p-8"><Spinner label="Loading the audit log" /></div>}
        {audit.isError && <p role="alert" className="p-6 text-body-md text-error">Couldn't load the audit log. Check your connection.</p>}
        {audit.data && entries.length === 0 && (
          <Empty icon="assignment" title="Nothing recorded">{action ? 'No action of this kind has been taken.' : 'Moderator actions will appear here.'}</Empty>
        )}
        {entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-body-md">
              <thead className="border-b border-border-muted bg-surface text-[11px] font-semibold tracking-[0.07em] text-text-secondary uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Time</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Who</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Action</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Item</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {entries.map((entry) => {
                  const subject = auditSubject(entry)
                  return (
                    <tr key={entry.id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-on-surface tabular-nums">
                        <time dateTime={entry.created_at}>{dateTime(entry.created_at)}</time>
                      </td>
                      <td className="px-4 py-3 text-on-surface">{entry.actor_name ?? 'Deleted account'}</td>
                      <td className="px-4 py-3"><ActionChip action={entry.action} /></td>
                      <td className="px-4 py-3">
                        {subject.reportId
                          ? <Link to={`/moderation/reports/${subject.reportId}?tab=${entry.action === 'reject' || entry.action === 'merge' ? 'rejected' : 'verified'}`} className="font-semibold text-primary">{subject.title}</Link>
                          : <span className="font-semibold text-on-surface">{subject.title}</span>}
                        <span className="block text-body-sm text-text-secondary">{subject.detail}</span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">{auditDetail(entry)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {audit.hasNextPage && (
          <div className="border-t border-border-muted p-3 text-center">
            <button type="button" onClick={() => audit.fetchNextPage()} disabled={audit.isFetchingNextPage}
              className="h-9 rounded-md border border-border-muted px-4 text-label-lg text-on-surface hover:bg-surface disabled:opacity-60">
              {audit.isFetchingNextPage ? 'Loading…' : 'Show older entries'}
            </button>
          </div>
        )}
      </Card>
    </>
  )
}
