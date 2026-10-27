// The official logo files from brand/ (text already outlined), used as they are, per the brand guide:
// the horizontal logo everywhere, the Nepali-first one only where the brand should feel local (the welcome screen).
const FILES = {
  horizontal: 'sarathi-logo-horizontal',
  nepali: 'sarathi-logo-nepali',
  icon: 'sarathi-icon',
}

type LogoProps = {
  variant?: keyof typeof FILES
  onBlue?: boolean
  className?: string
}

/** The Sarathi logo; set its height with className (the guide's minimum is 24 px, 16 px for the icon). */
export function Logo({ variant = 'horizontal', onBlue = false, className = 'h-9' }: LogoProps) {
  const name = variant === 'icon'
    ? (onBlue ? 'sarathi-icon-inverted' : 'sarathi-icon')
    : `${FILES[variant]}${onBlue ? '-white' : ''}`
  return <img src={`/brand/svg/${name}.svg`} alt="Sarathi" className={`w-auto ${className}`} />
}
