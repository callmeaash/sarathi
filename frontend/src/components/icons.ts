// Line icons on a 24 x 24 grid (1.8 px stroke, round caps), the same style as the GeoKitta project.
// Each entry is the inside of an <svg>; names follow the Material names the app used before.

const PIN = 'M12 21s-6-5.33-6-11a6 6 0 1 1 12 0c0 5.67-6 11-6 11z'
const SHIELD = 'M12 3 4 6v6c0 5 3.5 8 8 9 4.500-1 8-4 8-9V6z'
const RING = '<circle cx="12" cy="12" r="9"/>'
const LOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
const MAIL = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.500 7.500 8.500 6 8.500-6"/>'
const CLIPBOARD = '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>'
const CAR = '<path d="M4 17v-4.500l2-5A2 2 0 0 1 7.900 6h8.200a2 2 0 0 1 1.900 1.500l2 5V17"/>'
  + '<path d="M4 12.500h16M3 17h18M6 17v2M18 17v2M7.500 14.800h.01M16.500 14.800h.01"/>'
const SOLID = 'fill="currentColor" stroke="none"'

export const ICONS = {
  // Navigation and actions
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  remove: '<path d="M5 12h14"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M5 12.500 10 17l9-10"/>',
  arrow_back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrow_forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron_right: '<path d="m9 6 6 6-6 6"/>',
  swap_vert: '<path d="M8 4v16M4.500 7.500 8 4l3.500 3.500M16 20V4M12.500 16.500 16 20l3.500-3.500"/>',
  open_in_new: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  share: '<circle cx="6" cy="12" r="2.500"/><circle cx="17.500" cy="5.500" r="2.500"/><circle cx="17.500" cy="18.500" r="2.500"/>'
    + '<path d="m8.200 10.800 7-4M8.200 13.200l7 4"/>',
  content_copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  send: '<path d="M21 3 10.500 13.500M21 3l-6.500 18-4-7.500L3 9.500z"/>',
  more_horiz: `<circle cx="5.500" cy="12" r="1.300" ${SOLID}/><circle cx="12" cy="12" r="1.300" ${SOLID}/><circle cx="18.500" cy="12" r="1.300" ${SOLID}/>`,
  touch_app: '<path d="M9 11V5.500a1.500 1.500 0 0 1 3 0V11"/><path d="M12 10.500a1.500 1.500 0 0 1 3 0V12M15 11.500a1.500 1.500 0 0 1 3 0V15a6 6 0 0 1-6 6h-.500a5 5 0 0 1-4-2L5 15.500a1.500 1.500 0 0 1 2.300-1.900L9 15"/>',
  pan_tool: '<path d="M12 3v18M3 12h18M9.500 5.500 12 3l2.500 2.500M9.500 18.500 12 21l2.500-2.500M5.500 9.500 3 12l2.500 2.500M18.500 9.500 21 12l-2.500 2.500"/>',

  // Map and places
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  explore: `${RING}<path d="m15.500 8.500-2 5-5 2 2-5z"/>`,
  my_location: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.500"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  navigation: '<path d="M12 3 5 20l7-4 7 4z"/>',
  location_on: `<path d="${PIN}"/><circle cx="12" cy="10" r="2.200"/>`,
  add_location_alt: `<path d="${PIN}"/><path d="M12 7.500v5M9.500 10h5"/>`,
  wrong_location: `<path d="${PIN}"/><path d="m10 8 4 4M14 8l-4 4"/>`,
  // A solid pin for markers on the map, where an outline would be lost against the streets.
  pin_solid: `<path d="M12 23.500s-7.500-6.500-7.500-13.500a7.500 7.500 0 1 1 15 0c0 7-7.500 13.500-7.500 13.500z" ${SOLID}/><circle cx="12" cy="10" r="2.800" fill="#fff" stroke="none"/>`,
  public: `${RING}<path d="M3 12h18M12 3c2.500 2.700 3.800 5.700 3.800 9s-1.300 6.300-3.800 9c-2.500-2.700-3.800-5.700-3.800-9S9.500 5.700 12 3z"/>`,
  straighten: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7.500 12.500 2 2M10.500 9.500l2 2M13.500 6.500l2 2"/>',
  bolt: '<path d="M13 2.500 5 13.500h6l-1 8 8-11h-6z"/>',

  // Routes and roads
  directions: '<path d="M12 2.500 21.500 12 12 21.500 2.500 12z"/><path d="M9 15v-2.500A1.500 1.500 0 0 1 10.500 11H15M13 9l2 2-2 2"/>',
  alt_route: '<path d="M12 21v-7"/><path d="M12 14c0-4-5-4-5-9M4.500 7.500 7 5l2.500 2.500"/><path d="M12 14c0-4 5-4 5-9M14.500 7.500 17 5l2.500 2.500"/>',
  route: '<circle cx="6" cy="18" r="2.500"/><circle cx="18" cy="6" r="2.500"/><path d="M8.500 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.500"/>',
  remove_road: '<path d="M8 3 5 21M16 3l3 18M10 10l4 4M14 10l-4 4"/>',
  directions_car: CAR,
  two_wheeler: '<circle cx="5.500" cy="16.500" r="3"/><circle cx="18.500" cy="16.500" r="3"/><path d="M5.500 16.500 9 10h6l3.500 6.500M9 10 8 7.500H6M15 10l-1-3h3M12 16.500 15 10"/>',

  // Facilities
  local_hospital: '<rect x="3.500" y="3.500" width="17" height="17" rx="3"/><path d="M12 8v8M8 12h8"/>',
  add_box: '<rect x="3.500" y="3.500" width="17" height="17" rx="3"/><path d="M12 8v8M8 12h8"/>',
  local_police: `<path d="${SHIELD}"/><path d="m12 8.500 1 2.200 2.300.2-1.700 1.600.5 2.300-2.100-1.200-2.100 1.200.5-2.300-1.700-1.600 2.300-.2z"/>`,
  medication: '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="m9.200 9.200 5.600 5.600"/>',
  local_fire_department: '<path d="M12 3c.5 3.500 5 5.500 5 10.500a5 5 0 0 1-10 0c0-2 1-3.500 2-4.500.3 1.500 1 2.300 2 2.500C10.500 8.500 11 5 12 3z"/>',
  call: '<path d="M5 4h3.500L10 8.500 8 10a12 12 0 0 0 6 6l1.500-2 4.500 1.500V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',

  // Hazards
  warning: '<path d="M10.300 3.900 1.800 18a2 2 0 0 0 1.700 3h17a2 2 0 0 0 1.700-3L13.700 3.900a2 2 0 0 0-3.400 0z"/><path d="M12 9v4M12 17h.01"/>',
  landslide: '<path d="M3 20 10 7l4 6 2-3 5 10z"/><circle cx="17" cy="5" r="1.300"/><circle cx="20.300" cy="8.200" r=".9"/>',
  flood: '<path d="M12 3c2 2.600 3.500 4.400 3.500 6.300a3.500 3.500 0 0 1-7 0C8.500 7.400 10 5.600 12 3z"/>'
    + '<path d="M2 16c2 0 2-1.500 4-1.500s2 1.500 4 1.500 2-1.500 4-1.500 2 1.500 4 1.500 2-1.500 4-1.500M2 20.500c2 0 2-1.500 4-1.500s2 1.500 4 1.500 2-1.500 4-1.500 2 1.500 4 1.500 2-1.500 4-1.500"/>',
  car_crash: '<path d="M3 18v-4l1.800-4.500A2 2 0 0 1 6.700 8H13a2 2 0 0 1 1.900 1.400L16.500 14v4"/>'
    + '<path d="M3 14h13.500M2 18h15.500M5 18v2M14.500 18v2M19 3v3M22 7.500l-2.500 1M16.500 4.500l1 2"/>',
  block: `${RING}<path d="m5.600 5.600 12.800 12.800"/>`,
  construction: '<path d="M10 4h4l4 14H6z"/><path d="M4 20h16M8.600 9.500h6.800M7.400 14h9.200"/>',
  campaign: '<path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M17.500 9a4 4 0 0 1 0 6M7 14l1 5h2.500l-1-4.500"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',

  // Photos
  add_a_photo: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.500" r="3.500"/>',

  // Status
  info: `${RING}<path d="M12 16v-4M12 8h.01"/>`,
  error: `${RING}<path d="M12 7.500v5M12 16h.01"/>`,
  check_circle: `${RING}<path d="m8 12.500 3 3 5-6"/>`,
  task_alt: '<path d="M20.500 12a8.500 8.500 0 1 1-4.800-7.600"/><path d="m8.500 11.500 3.500 3.500 8.500-9.500"/>',
  cancel: `${RING}<path d="m15 9-6 6M9 9l6 6"/>`,
  schedule: `${RING}<path d="M12 7v5l3 2"/>`,
  hourglass_top: '<path d="M7 3h10M7 21h10M8 3v3.500c0 2 4 3.500 4 5.500s-4 3.500-4 5.500V21M16 3v3.500c0 2-4 3.500-4 5.500s4 3.500 4 5.500V21"/>',
  call_merge: '<path d="M12 4v8M9 7l3-3 3 3M12 12l-5 8M12 12l5 8"/>',
  radio_button_unchecked: '<circle cx="12" cy="12" r="8"/>',
  radio_button_checked: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.500" ${SOLID}/>`,
  cloud_off: '<path d="M7 18a4 4 0 0 1-.6-7.950A5.500 5.500 0 0 1 8 7.500M10.500 5.700A5.500 5.500 0 0 1 17.400 10a4 4 0 0 1 2.200 7M7 18h9.500M3 3l18 18"/>',
  verified: '<path d="m12 3 2.300 1.600 2.800-.1 1 2.600 2.200 1.700-.8 2.700.8 2.700-2.200 1.700-1 2.600-2.800-.1L12 21l-2.300-1.600-2.800.1-1-2.600-2.200-1.700.8-2.700-.8-2.700 2.200-1.700 1-2.600 2.800.1z"/><path d="m9 12 2 2 4-4"/>',

  // Accounts
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  account_circle: `${RING}<circle cx="12" cy="10" r="3"/><path d="M6.500 18.200a6.500 6.500 0 0 1 11 0"/>`,
  shield: `<path d="${SHIELD}"/>`,
  verified_user: `<path d="${SHIELD}"/><path d="m9 12 2 2 4-4"/>`,
  shield_person: `<path d="${SHIELD}"/><circle cx="12" cy="10" r="2"/><path d="M8.500 16a3.500 3.500 0 0 1 7 0"/>`,
  lock: LOCK,
  lock_reset: `${LOCK}<path d="M12 15v2"/>`,
  login: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 17 5-5-5-5M15 12H4"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 17-5-5 5-5M5 12h11"/>',
  mail: MAIL,
  mark_email_unread: `${MAIL}<circle cx="19.500" cy="5.500" r="2.400" ${SOLID}/>`,
  assignment: CLIPBOARD,
  visibility: '<path d="M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  visibility_off: '<path d="M3 3l18 18M10.600 5.100A10.700 10.700 0 0 1 12 5c6.500 0 10 7 10 7a17 17 0 0 1-3.200 4M6.600 6.600C3.800 8.400 2 12 2 12s3.500 7 10 7a10 10 0 0 0 5.400-1.600"/><path d="M9.900 9.900a3 3 0 0 0 4.200 4.200"/>',
} as const

export type IconName = keyof typeof ICONS

const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'

/** An icon as an HTML string, for Leaflet markers, which are built from HTML and not from React. */
export function iconHtml(name: IconName): string {
  return `<svg class="icon" ${SVG_ATTRS}>${ICONS[name]}</svg>`
}
