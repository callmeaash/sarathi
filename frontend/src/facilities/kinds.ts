export const FACILITY_KINDS = ['hospital', 'police', 'pharmacy', 'fire_station'] as const
export type FacilityKind = (typeof FACILITY_KINDS)[number]

type KindInfo = {
  label: string        // one place: "Hospital"
  plural: string       // filter chip: "Hospitals"
  icon: string         // Material Symbols name
  minZoom: number      // hidden when zoomed further out, to keep the map readable
  chip: string         // chip colours when switched on
  badge: string        // solid colour of the icon square on the panel cards
}

export const KINDS: Record<FacilityKind, KindInfo> = {
  hospital: { label: 'Hospital', plural: 'Hospitals', icon: 'local_hospital', minZoom: 0,
    chip: 'border-facility-hospital-pink/40 bg-[#fde4e8] text-[#9c1c34]', badge: 'bg-facility-hospital-pink' },
  police: { label: 'Police station', plural: 'Police', icon: 'local_police', minZoom: 13,
    chip: 'border-primary/40 bg-primary-fixed text-on-primary-fixed', badge: 'bg-facility-police-blue' },
  pharmacy: { label: 'Pharmacy', plural: 'Pharmacies', icon: 'medication', minZoom: 14,
    chip: 'border-facility-pharmacy-green/40 bg-[#dcf3e3] text-[#0d5a28]', badge: 'bg-facility-pharmacy-green' },
  fire_station: { label: 'Fire station', plural: 'Fire stations', icon: 'local_fire_department', minZoom: 0,
    chip: 'border-facility-fire-orange/40 bg-[#fde9d6] text-[#8a3f00]', badge: 'bg-facility-fire-orange' },
}

/** Display information for a kind from the API (unknown kinds fall back to a generic place). */
export function kindInfo(kind: string): KindInfo {
  return KINDS[kind as FacilityKind]
    ?? { label: 'Place', plural: 'Places', icon: 'location_on', minZoom: 0, chip: '', badge: 'bg-outline' }
}
