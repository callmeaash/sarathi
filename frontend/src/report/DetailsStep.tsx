import { type FormEvent, type ReactNode, useState } from 'react'
import { Link } from 'react-router'

import { ApiError, describeError } from '../api/client'
import { Alert } from '../components/Alert'
import { Icon } from '../components/Icon'
import { Button } from '../components/form/Button'
import { hazardInfo } from '../hazards/kinds'
import { waitWording } from '../pages/auth/fieldErrors'
import type { LatLon } from './CenterPin'
import { type HazardKind, type Passable, useReportHazard } from './api'

const KINDS: HazardKind[] = ['landslide', 'flood', 'accident', 'road_blocked', 'road_works', 'other']
const OTHER_LABEL = 'Other'

const PASSABLE: { value: Passable; label: string; help: string }[] = [
  { value: 'no', label: 'No', help: 'Nothing can get past, not even motorbikes.' },
  { value: 'partly', label: 'Partly', help: 'Some vehicles can get past, slowly or on one lane.' },
  { value: 'unsure', label: 'Not sure', help: "You couldn't tell whether vehicles get through." },
]

export const MAX_NOTE = 200

/** What went wrong with a submission, in words, with a way forward where there is one. */
function submitError(error: unknown, onChangeSpot: () => void): ReactNode {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return <>You've already reported this hazard; it's waiting for review. <Link to="/reports" className="font-semibold underline">See my reports</Link></>
    }
    if (error.status === 429) return `You've sent a lot of reports in the last hour. Try again ${waitWording(error.retryAfter)}.`
    if (error.status === 422 && /no road within/i.test(error.message)) {
      return <>This spot is too far from a road. <button type="button" onClick={onChangeSpot} className="font-semibold underline">Move the pin</button></>
    }
  }
  return describeError(error)
}

type DetailsStepProps = {
  point: LatLon
  roadName: string | null | undefined
  onBack: () => void
  onSubmitted: (id: number) => void
}

/** Step 2 (screen 12): what's happening, whether vehicles get through, and an optional note. */
export function DetailsStep({ point, roadName, onBack, onSubmitted }: DetailsStepProps) {
  const [kind, setKind] = useState<HazardKind | null>(null)
  const [passable, setPassable] = useState<Passable>('unsure')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const report = useReportHazard()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (!kind) return
    report.mutate({ kind, passable, note: note.trim() || null, lat: point.lat, lon: point.lon },
      { onSuccess: (incident) => onSubmitted(incident.id) })
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="mb-1 text-label-md tracking-[0.08em] text-on-surface-variant uppercase">Step 2 of 2 · What's happening?</p>
      <div className="flex items-center gap-3 rounded-xl border border-border-muted bg-surface-container-lowest p-3">
        <Icon name="location_on" filled className="text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-title-md text-on-surface">{roadName ?? 'Unnamed road'}</p>
          <p className="text-body-sm text-text-secondary tabular-nums">{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</p>
        </div>
        <button type="button" onClick={onBack} className="rounded-full px-3 py-1.5 text-label-lg text-primary hover:bg-surface-tint-light">
          Change
        </button>
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 text-title-md text-on-surface">What's happening?</legend>
        <div role="radiogroup" aria-label="Hazard type" className="grid grid-cols-3 gap-2">
          {KINDS.map((value) => {
            const info = hazardInfo(value)
            const on = kind === value
            return (
              <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setKind(value)}
                className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-label-lg transition-colors ${
                  on ? 'border-primary bg-surface-tint-light text-primary' : 'border-transparent bg-surface-container-low text-on-surface hover:bg-surface-container'}`}>
                <span className={`grid size-10 place-items-center rounded-full ${info.tint}`}><Icon name={info.icon} /></span>
                {value === 'other' ? OTHER_LABEL : info.label}
                {on && <Icon name="check_circle" filled className="absolute top-1.5 right-1.5 text-[18px] text-primary" />}
              </button>
            )
          })}
        </div>
        {tried && !kind && <p role="alert" className="mt-2 text-body-md text-error">Choose what's happening.</p>}
      </fieldset>

      <fieldset className="mt-5">
        <legend className="mb-2 flex items-center gap-1.5 text-title-md text-on-surface">
          <Icon name="two_wheeler" className="text-[20px]" /> Can vehicles get through?
        </legend>
        <div role="radiogroup" aria-label="Can vehicles get through?" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-container p-1">
          {PASSABLE.map((option) => (
            <button key={option.value} type="button" role="radio" aria-checked={passable === option.value}
              onClick={() => setPassable(option.value)}
              className={`flex h-10 items-center justify-center gap-1 rounded-lg text-label-lg ${
                passable === option.value ? 'bg-surface-container-lowest text-primary shadow-[0_1px_2px_rgb(0_0_0/0.12)]' : 'text-on-surface-variant'}`}>
              {passable === option.value && <Icon name="check" className="text-[18px]" />} {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-body-sm text-text-secondary">{PASSABLE.find((o) => o.value === passable)!.help}</p>
      </fieldset>

      <label className="mt-5 block rounded-xl bg-surface-container-low p-3 focus-within:ring-2 focus-within:ring-primary">
        <span className="text-body-sm text-text-secondary">Details (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE} rows={3}
          placeholder="e.g. Water above knee height, bikes turning back"
          className="mt-1 block w-full resize-none bg-transparent text-body-lg text-on-surface outline-none placeholder:text-outline" />
        <span className="block text-right text-body-sm text-text-secondary tabular-nums">{note.length}/{MAX_NOTE}</span>
      </label>

      {report.isError && <div className="mt-4"><Alert tone="error">{submitError(report.error, onBack)}</Alert></div>}

      <Button type="submit" full icon="send" loading={report.isPending} className="mt-5">Submit report</Button>
      <p className="mt-3 flex items-start gap-2 text-body-sm text-text-secondary">
        <Icon name="verified_user" className="text-[18px]" />
        Sarathi moderators check every report before it changes anyone's route.
      </p>
    </form>
  )
}
