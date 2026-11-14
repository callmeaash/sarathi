import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import { Alert } from '../components/Alert'
import { Icon } from '../components/Icon'
import { Spinner } from '../components/Spinner'
import { hazardInfo, roadLabel } from '../hazards/kinds'
import { type Report, type ReviewedStatus, useQueue, useReviewed } from './api'
import { ReportReview } from './ReportReview'
import { Empty, HazardIcon, PanelHeader, StatusChip } from './shared'
import { waited } from './text'

type Tab = 'pending' | 'verified' | 'rejected'

const TABS: { key: Tab; label: string; statuses: ReviewedStatus[]; empty: string }[] = [
  { key: 'pending', label: 'Pending', statuses: [], empty: 'Every report has been reviewed.' },
  { key: 'verified', label: 'Verified', statuses: ['verified', 'cleared'], empty: 'No report has been verified yet.' },
  { key: 'rejected', label: 'Rejected', statuses: ['rejected', 'merged'], empty: 'No report has been rejected or merged.' },
]

/** One report in the list on the left. */
function Row({ report, tab, selected }: { report: Report; tab: Tab; selected: boolean }) {
  const when = report.cleared_at ?? report.reviewed_at ?? report.created_at
  return (
    <li>
      <Link to={`/moderation/reports/${report.id}${tab === 'pending' ? '' : `?tab=${tab}`}`} aria-current={selected ? 'true' : undefined}
        className={`flex items-start gap-3 border-l-[3px] px-4 py-3 ${
          selected ? 'border-primary bg-surface-tint-light' : 'border-transparent hover:bg-surface'}`}>
        <HazardIcon kind={report.kind} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-label-lg ${selected ? 'text-primary' : 'text-on-surface'}`}>{hazardInfo(report.kind).label}</span>
          <span className="block truncate text-body-sm text-on-surface-variant">{roadLabel(report.road_name)}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-body-sm text-text-secondary">
            {tab !== 'pending' && <StatusChip status={report.status} />}
            {report.photos.length > 0 && <span className="inline-flex items-center gap-1"><Icon name="add_a_photo" className="text-[14px]" />{report.photos.length}</span>}
            {tab === 'pending' && report.similar_reports > 0 && <span>{report.similar_reports} similar nearby</span>}
          </span>
        </span>
        <span className="shrink-0 text-body-sm text-text-secondary tabular-nums">{waited(when)}</span>
      </Link>
    </li>
  )
}

/** The review queue: the list of reports on one side, the chosen report on the other (one at a time on phones). */
export function ReportsPage() {
  const params = useParams()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const selected = params.id ? Number(params.id) : null
  const tab = TABS.find((entry) => entry.key === search.get('tab')) ?? TABS[0]
  const [notice, setNotice] = useState<string | null>(null)
  const queue = useQueue()
  const reviewed = useReviewed(tab.statuses, tab.key !== 'pending')
  const list = tab.key === 'pending' ? queue : reviewed
  const reports = list.data ?? []

  // After a decision: say what happened and move on to the next report waiting, if there is one.
  const decided = (message: string) => {
    setNotice(message)
    const next = (queue.data ?? []).find((report) => report.id !== selected)
    navigate(tab.key === 'pending' && next ? `/moderation/reports/${next.id}` : `/moderation/reports${tab.key === 'pending' ? '' : `?tab=${tab.key}`}`)
  }

  return (
    <>
      <PanelHeader title="Reports" subtitle="Check each report, then verify it to close the road or reject it with a reason.">
        <div role="tablist" aria-label="Reports by status" className="flex gap-0.5 rounded-md border border-border-muted bg-surface-container p-[3px]">
          {TABS.map((entry) => (
            <Link key={entry.key} role="tab" aria-selected={entry.key === tab.key}
              to={`/moderation/reports${entry.key === 'pending' ? '' : `?tab=${entry.key}`}`}
              className={`flex h-8 items-center gap-1.5 rounded-sm px-3 text-[13px] font-medium ${
                entry.key === tab.key ? 'bg-surface-container-lowest text-on-surface shadow-[0_1px_2px_rgb(15_23_42/0.1)]' : 'text-on-surface-variant'}`}>
              {entry.label}
              {entry.key === 'pending' && (queue.data?.length ?? 0) > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-pending-amber px-1.5 text-[11px] font-semibold text-on-surface tabular-nums">{queue.data!.length}</span>
              )}
            </Link>
          ))}
        </div>
      </PanelHeader>

      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}

      <div className="overflow-hidden rounded-xl border border-border-muted bg-surface-container-lowest lg:grid lg:min-h-[32rem] lg:grid-cols-[22rem_1fr]">
        <section aria-label={`${tab.label} reports`} className={`border-border-muted lg:block lg:border-r ${selected ? 'hidden' : ''}`}>
          <p className="border-b border-border-muted px-4 py-2.5 text-[11px] font-semibold tracking-[0.07em] text-text-secondary uppercase">
            {tab.key === 'pending' ? 'Oldest first' : 'Most recent decision first'} · {reports.length}
          </p>
          {list.isPending && <div className="p-8"><Spinner label="Loading reports" /></div>}
          {list.isError && <p role="alert" className="p-4 text-body-md text-error">Couldn't load the reports. Check your connection.</p>}
          {list.data && reports.length === 0 && <Empty icon="check_circle" title="Nothing here">{tab.empty}</Empty>}
          <ul className="divide-y divide-border-muted lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto">
            {reports.map((report) => <Row key={report.id} report={report} tab={tab.key} selected={report.id === selected} />)}
          </ul>
        </section>

        <section aria-label="Selected report" className={`min-w-0 lg:block ${selected ? '' : 'hidden'}`}>
          {selected ? (
            <>
              <Link to={`/moderation/reports${tab.key === 'pending' ? '' : `?tab=${tab.key}`}`}
                className="m-3 mb-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-label-lg text-primary hover:bg-surface-container lg:hidden">
                <Icon name="arrow_back" className="text-[20px]" /> All reports
              </Link>
              {/* A new key for each report, so the radius and any half-written reason start afresh. */}
              <ReportReview key={selected} id={selected} onDecided={decided} />
            </>
          ) : (
            <Empty icon="flag" title="Choose a report">Pick a report from the list to see its details and decide on it.</Empty>
          )}
        </section>
      </div>
    </>
  )
}
