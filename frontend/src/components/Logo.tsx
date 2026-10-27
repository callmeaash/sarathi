type LogoProps = {
  onBlue?: boolean
  showName?: boolean
}

/** The Sarathi app icon, optionally with the name beside it. */
export function Logo({ onBlue = false, showName = true }: LogoProps) {
  const icon = onBlue ? '/brand/svg/sarathi-icon-inverted.svg' : '/brand/svg/sarathi-icon.svg'
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src={icon} alt={showName ? '' : 'Sarathi'} className="size-9" />
      {showName && (
        <span className={`text-headline-md font-bold tracking-tight ${onBlue ? 'text-white' : 'text-on-surface'}`}>
          Sarathi
        </span>
      )}
    </span>
  )
}
