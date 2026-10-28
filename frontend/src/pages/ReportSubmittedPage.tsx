import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'

import { Icon } from '../components/Icon'
import { Spinner } from '../components/Spinner'
import { buttonClass } from '../components/form/buttonStyles'
import { useIncident } from '../hazards/api'
import { hazardInfo, roadLabel } from '../hazards/kinds'
import { dateTime } from '../lib/time'
import { BaseLayers } from '../map/BaseLayers'
import { useAppMap } from '../map/context'
import { focusOn } from '../map/focus'
import { requestSheet } from '../layouts/useBottomSheet'

const STAGES = [
  { title: 'Submitted', text: 'Your report is saved.' },
  { title: 'Waiting for review', text: 'A Sarathi moderator checks it.' },
  { title: 'Verified', text: 'The roads around it close, and routes go around them.' },
  { title: 'Cleared', text: 'The hazard is gone and the roads open again.' },
]

/** Screen 13: confirmation after sending a report, with what happens next. */
export function ReportSubmittedPage() {
  const id = Number(useParams().id)
  const { data } = useIncident(id)
  const { map } = useAppMap()
  const centred = useRef(false)
  useEffect(() => requestSheet('full'), [])  // the confirmation and what happens next, on the whole screen

  useEffect(() => {  // show the new report on the map, once
    if (!map || !data || centred.current) return
    centred.current = true
    focusOn(map, [data.lat, data.lon], Math.max(map.getZoom(), 16))
  }, [map, data])

  return (
    <>
      <title>Report submitted · Sarathi</title>
      <BaseLayers hazardId={id} />
      <div className="flex justify-end">
        <Link to="/" aria-label="Close" className="grid size-10 place-items-center rounded-full bg-surface-container hover:bg-surface-container-high">
          <Icon name="close" />
        </Link>
      </div>
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-tertiary text-white ring-8 ring-tertiary-fixed/50">
          <Icon name="check" className="text-[34px]" />
        </span>
        <h1 className="mt-5 text-headline-md text-on-surface">Report submitted</h1>
        {data ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-tint-medium px-3 py-1 text-label-lg text-primary">
            <Icon name={hazardInfo(data.kind).icon} className="text-[18px]" />
            {hazardInfo(data.kind).label} on {roadLabel(data.road_name)}
          </p>
        ) : <Spinner label="Loading report" />}
        <p className="mx-auto mt-3 max-w-sm text-body-md text-text-secondary">
          Routes won't change until a moderator verifies your report. You can follow it in My reports.
        </p>
      </div>

      <ol aria-label="What happens next" className="mt-6 rounded-xl border border-border-muted bg-surface-container-lowest p-4">
        {STAGES.map((stage, index) => {
          const done = index === 0
          const current = index === 1
          return (
            <li key={stage.title} className="relative flex gap-3 pb-4 last:pb-0">
              {index < STAGES.length - 1 && (
                <span aria-hidden className={`absolute top-8 bottom-0 left-[15px] w-0.5 ${done ? 'bg-primary' : 'bg-border-muted'}`} />
              )}
              <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full ${
                done ? 'bg-primary text-white' : current ? 'border-2 border-primary bg-surface-container-lowest' : 'bg-surface-container text-on-surface-variant'}`}>
                {done ? <Icon name="check" className="text-[18px]" />
                  : current ? <span className="size-3 rounded-full bg-primary" /> : <Icon name={index === 2 ? 'shield' : 'task_alt'} className="text-[18px]" />}
              </span>
              <div className="min-w-0 pt-1">
                <p className={`text-title-md ${current ? 'text-primary' : done ? 'text-on-surface' : 'text-text-secondary'}`}>
                  {stage.title}
                  {current && <span className="ml-2 rounded-md bg-primary-fixed px-1.5 py-0.5 text-label-sm text-on-primary-fixed">Now</span>}
                </p>
                <p className="text-body-sm text-text-secondary">
                  {done && data ? `${dateTime(data.created_at)} · ` : ''}{stage.text}
                </p>
              </div>
            </li>
          )
        })}
      </ol>

      <Link to="/" className={`${buttonClass('primary', true)} mt-6`}>Done <Icon name="check" className="text-[20px]" /></Link>
      <Link to="/reports" className={`${buttonClass('text', true)} mt-2`}>View my reports</Link>
    </>
  )
}
