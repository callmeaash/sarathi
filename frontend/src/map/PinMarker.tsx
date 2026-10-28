import L from 'leaflet'
import { Marker } from 'react-leaflet'

const PIN = L.divIcon({
  className: '',
  iconSize: [44, 44],
  iconAnchor: [22, 42],  // the tip of the pin sits on the spot
  html: '<span class="drop-pin"><span class="icon icon-filled">location_on</span></span>',
})

type PinMarkerProps = { lat: number; lon: number; onMove: (lat: number, lon: number) => void }

/** The dropped pin; it can be dragged to fine-tune the spot. */
export function PinMarker({ lat, lon, onMove }: PinMarkerProps) {
  return (
    <Marker
      position={[lat, lon]}
      icon={PIN}
      draggable
      autoPan
      zIndexOffset={3000}
      title="Dropped pin (drag to move)"
      alt="Dropped pin"
      eventHandlers={{
        dragend: (event) => {
          const { lat: newLat, lng } = (event.target as L.Marker).getLatLng()
          onMove(newLat, lng)
        },
      }}
    />
  )
}
