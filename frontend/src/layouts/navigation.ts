export type NavItem = {
  to: string
  label: string
  icon: string
}

// Desktop has room for every section beside the map; phones keep the four used most, as in the screen designs.
export const DESKTOP_NAV: NavItem[] = [
  { to: '/', label: 'Map', icon: 'map' },
  { to: '/directions', label: 'Directions', icon: 'directions' },
  { to: '/hazards', label: 'Hazards', icon: 'warning' },
  { to: '/nearby', label: 'Nearby', icon: 'location_on' },
  { to: '/reports', label: 'My reports', icon: 'campaign' },
]

export const MOBILE_NAV: NavItem[] = [
  { to: '/', label: 'Explore', icon: 'explore' },
  { to: '/nearby', label: 'Nearby', icon: 'near_me' },
  { to: '/reports', label: 'My reports', icon: 'assignment' },
  { to: '/account', label: 'Account', icon: 'account_circle' },
]
