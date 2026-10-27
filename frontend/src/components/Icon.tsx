type IconProps = {
  name: string
  filled?: boolean
  className?: string
  label?: string
}

/** A Material Symbols icon; decorative unless a label is given. */
export function Icon({ name, filled = false, className = '', label }: IconProps) {
  return (
    <span
      className={`icon ${filled ? 'icon-filled' : ''} ${className}`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  )
}
