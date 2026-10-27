type HazardInfo = { label: string; icon: string; tint: string }

// Colours from the design system; tint is for list icons (markers use status colours instead).
export const HAZARDS: Record<string, HazardInfo> = {
  landslide: { label: 'Landslide', icon: 'landslide', tint: 'bg-[#f1e6de] text-hazard-landslide-brown' },
  flood: { label: 'Flooding', icon: 'flood', tint: 'bg-[#dceafa] text-hazard-flood-blue' },
  accident: { label: 'Accident', icon: 'car_crash', tint: 'bg-[#fde6d9] text-hazard-accident-orange' },
  road_blocked: { label: 'Road blocked', icon: 'block', tint: 'bg-error-container text-hazard-blocked-red' },
  road_works: { label: 'Road works', icon: 'construction', tint: 'bg-[#fff1d6] text-hazard-works-amber' },
  other: { label: 'Hazard', icon: 'warning', tint: 'bg-surface-container text-on-surface-variant' },
}

/** Display information for a hazard kind (unknown kinds show as a general hazard). */
export function hazardInfo(kind: string): HazardInfo {
  return HAZARDS[kind] ?? HAZARDS.other
}

/** Whether vehicles can get through, in words; nothing when the reporter wasn't sure. */
export function passableText(passable: string): string | null {
  if (passable === 'no') return 'Vehicles cannot pass'
  if (passable === 'partly') return 'Partly passable'
  return null
}

/** Road name, or a fallback for unnamed roads. */
export function roadLabel(road: string | null): string {
  return road ?? 'Unnamed road'
}
