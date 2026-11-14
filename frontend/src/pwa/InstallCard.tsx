import { Icon } from '../components/Icon'
import { install, useInstallState } from './install'

/** Offers to install Sarathi as an app where the browser allows it; on iPhone, says how. Nothing otherwise. */
export function InstallCard({ className = '' }: { className?: string }) {
  const state = useInstallState()
  if (state === 'unavailable' || state === 'installed') return null
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-border-muted bg-surface-container-lowest p-3 text-left ${className}`}>
      <img src="/brand/svg/sarathi-icon.svg" alt="" className="size-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-label-lg text-on-surface">Install Sarathi</p>
        {state === 'ready' ? (
          <p className="text-body-sm text-text-secondary">Open it from your home screen like any other app.</p>
        ) : (
          <p className="text-body-sm text-text-secondary">
            Tap <Icon name="ios_share" className="inline align-[-3px] text-[16px]" label="Share" /> in Safari, then
            “Add to Home Screen”.
          </p>
        )}
      </div>
      {state === 'ready' && (
        <button type="button" onClick={() => install()}
          className="h-9 shrink-0 rounded-md bg-primary px-3.5 text-label-lg text-white hover:bg-primary-hover">
          Install
        </button>
      )}
    </div>
  )
}
