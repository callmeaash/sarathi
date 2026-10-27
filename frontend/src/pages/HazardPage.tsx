import { type ReactNode, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { Icon } from '../components/Icon'
import { Spinner } from '../components/Spinner'
import { type Incident, useIncident } from '../hazards/api'
import { hazardInfo, passableText, roadLabel } from '../hazards/kinds'
import { dateTime, timeAgo } from '../lib/time'
import { LOCATE_ZOOM } from '../map/config'
import { useAppMap } from '../map/context'
import { BaseLayers } from '../map/BaseLayers'
import { focusOn } from '../map/focus'

const STATUS: Record<string, { text: string; detail: string; style: string; icon: string }> = {
  verified: {
    text: 'Verified closure', icon: 'block', style: 'bg-error-container text-on-error-container',
    detail: 'A moderator confirmed this. Routes and nearest-facility results avoid the roads around it.',
  },
  pending: {
    text: 'Waiting for review', icon: 'schedule', style: 'bg-[#fff1d6] text-[#7a5200]',
    detail: "Reported by a Sarathi user. It doesn't change routes until a moderator checks it.",
  },
  cleared: {
    text: 'Cleared', icon: 'check_circle', style: 'bg-tertiary-fixed/50 text-tertiary',
    detail: 'The hazard is gone and the roads are open again.',
  },
}

/** A labelled line of the hazard's history or details. */
function Fact({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2.5 text-body-md text-on-surface">
      <Icon name={icon} className="mt-px text-[20px] text-on-surface-variant" />
      <span>{children}</span>
    </li>
  )
}

/** Everything known about one hazard. */
function Details({ incident }: { incident: Incident }) {
  const { label, icon, tint } = hazardInfo(incident.kind)
  const status = STATUS[incident.status] ?? STATUS.pending
  const passable = passableText(incident.passable)
  const title = `${label} · ${roadLabel(incident.road_name)}`
  return (
    <>
      <title>{`${title} · Sarathi`}</title>
      <div className="flex items-start gap-4">
        <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${tint}`}><Icon name={icon} className="text-[28px]" /></span>
        <div className="min-w-0">
          <h1 className="text-headline-md text-on-surface">{label}</h1>
          <p className="text-body-lg text-text-secondary">{roadLabel(incident.road_name)}</p>
        </div>
      </div>

      <div className={`mt-5 rounded-xl px-4 py-3 ${status.style}`}>
        <p className="flex items-center gap-2 text-label-lg"><Icon name={status.icon} className="text-[20px]" />{status.text}</p>
        <p className="mt-1 text-body-md">{status.detail}</p>
      </div>

      {incident.note && (
        <blockquote className="mt-5 rounded-xl border-l-4 border-outline-variant bg-surface-container-low px-4 py-3 text-body-md text-on-surface">
          “{incident.note}”
          <footer className="mt-1 text-body-sm text-text-secondary">Reporter's note</footer>
        </blockquote>
      )}

      <ul className="mt-4 divide-y divide-border-muted">
        {passable && <Fact icon="directions_car">{passable}</Fact>}
        {incident.status !== 'pending' && incident.closure_radius_m && (
          <Fact icon="radio_button_checked">
            {incident.status === 'verified' ? 'Roads' : 'Roads were'} closed within {Math.round(incident.closure_radius_m)} m
          </Fact>
        )}
        <Fact icon="flag">Reported {timeAgo(incident.created_at)} <span className="text-text-secondary">· {dateTime(incident.created_at)}</span></Fact>
        {incident.reviewed_at && incident.status !== 'pending' && (
          <Fact icon="verified">Verified {timeAgo(incident.reviewed_at)} <span className="text-text-secondary">· {dateTime(incident.reviewed_at)}</span></Fact>
        )}
        {incident.cleared_at && (
          <Fact icon="check_circle">Cleared {timeAgo(incident.cleared_at)} <span className="text-text-secondary">· {dateTime(incident.cleared_at)}</span></Fact>
        )}
      </ul>
    </>
  )
}

/** One hazard, with the map centred on it. */
export function HazardPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { map } = useAppMap()
  const { data, error, isPending } = useIncident(id)
  const centredOn = useRef<number | null>(null)

  useEffect(() => {  // centre once per hazard, then leave the user free to pan
    if (!map || !data || data.id !== id || centredOn.current === id) return
    focusOn(map, [data.lat, data.lon], Math.max(map.getZoom(), LOCATE_ZOOM))
    centredOn.current = id
  }, [map, data, id])

  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/hazards'))
  const notFound = !Number.isInteger(id) || (error instanceof ApiError && error.status === 404)

  return (
    <>
      <BaseLayers hazardId={id} />
      <button type="button" onClick={back}
        className="-ml-2 mb-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-label-lg text-primary hover:bg-surface-tint-light">
        <Icon name="arrow_back" className="text-[20px]" /> Back
      </button>
      {notFound ? (
        <div className="py-8 text-center">
          <title>Hazard not found · Sarathi</title>
          <h1 className="text-headline-sm">Hazard not found</h1>
          <p className="mt-2 text-body-md text-text-secondary">It may have been removed or merged with another report.</p>
        </div>
      ) : isPending ? (
        <Spinner label="Loading hazard" />
      ) : error || !data ? (
        <p role="alert" className="py-6 text-body-md text-error">Couldn't load this hazard. Check your connection.</p>
      ) : (
        <Details incident={data} />
      )}
    </>
  )
}
