/** What to tell the user when the browser can't give their position. */
export function locationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return 'Location is blocked. Allow it in your browser settings to see where you are.'
    case 3:
      return 'Finding your location took too long. Try again.'
    default:
      return "Your location isn't available right now."
  }
}

export const OUTSIDE_DISTRICT = 'You are outside Kathmandu District. Sarathi has roads for the district only.'
export const NO_GEOLOCATION = "This browser can't share your location."

export const LOCATE_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
