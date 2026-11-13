import { ICONS, type IconName } from './icons'

type IconProps = {
  name: IconName
  filled?: boolean
  className?: string
  label?: string
}

/** A line icon sized by the text size (24 px by default); decorative unless a label is given. */
export function Icon({ name, filled = false, className = '', label }: IconProps) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? 2.2 : 1.8}  // "filled" marks the active item: a heavier line, as line icons have no fill
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  )
}
