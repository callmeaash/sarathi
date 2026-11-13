import 'leaflet/dist/leaflet.css'

import { useEffect, useState } from 'react'
import {
  AttributionControl, Circle, CircleMarker, MapContainer, Pane, ScaleControl, TileLayer, Tooltip, useMap, useMapEvents,
} from 'react-leaflet'

import { Link, useLocation, useNavigate } from 'react-router'

import { Icon } from '../components/Icon'
import { useBaseMap } from './baseMap'
import { BaseMapSwitch } from './BaseMapSwitch'
import { MAX_ZOOM, MIN_ZOOM, PANNING_BOUNDS, SATELLITE_TILES, TILES } from './config'
import { useAppMap } from './context'
import { LayersControl } from './LayersControl'
import { saveView, savedView } from './view'

const NOTICE_MS = 6000
const SHOW_ACCURACY_UP_TO_M = 1000
const PRIMARY = '#0f766e'

/** Hands the Leaflet map to the rest of the app. */
function ShareMap() {
  const map = useMap()
  const { setMap } = useAppMap()
  useEffect(() => {
    setMap(map)
    return () => setMap(null)
  }, [map, setMap])
  return null
}

/** Remembers where the map was looking, for the next visit. */
function RememberView() {
  useMapEvents({
    moveend(event) {
      const center = event.target.getCenter()
      saveView(center.lat, center.lng, event.target.getZoom())
    },
  })
  return null
}

/** Press and hold (right-click on a computer) to drop a pin; Leaflet turns a long press into "contextmenu". */
function DropPin() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useMapEvents({
    contextmenu(event) {
      const { lat, lng } = event.latlng
      navigate(`/pin?lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`, { replace: pathname === '/pin' })
    },
  })
  return null
}

/** Keeps the map filling its box when the window, panel or sheet changes size. */
function FitContainer() {
  const map = useMap()
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

/** Blue dot for the user's position, with a faint circle showing how precise it is. */
function YouAreHere() {
  const { location } = useAppMap()
  if (!location) return null
  const center: [number, number] = [location.lat, location.lon]
  // Its own pane above the markers (600), so facility badges never hide where the user is.
  return (
    <Pane name="you-are-here" style={{ zIndex: 650 }}>
      {location.accuracy <= SHOW_ACCURACY_UP_TO_M && (
        <Circle center={center} radius={location.accuracy} interactive={false}
          pathOptions={{ color: PRIMARY, weight: 1, opacity: 0.4, fillColor: PRIMARY, fillOpacity: 0.08 }} />
      )}
      <CircleMarker center={center} radius={8}
        pathOptions={{ color: '#ffffff', weight: 3, fillColor: PRIMARY, fillOpacity: 1 }}>
        <Tooltip direction="top" offset={[0, -8]}>You are here</Tooltip>
      </CircleMarker>
    </Pane>
  )
}

const controlButton = 'grid size-10 place-items-center bg-surface-container-lowest text-on-surface hover:bg-surface disabled:opacity-60'

/** Locate and zoom buttons; they sit above the phone's bottom sheet. */
function MapControls() {
  const { map, locate, locateStatus } = useAppMap()
  const reporting = useLocation().pathname.startsWith('/report')  // no "Report" button while already reporting
  const locating = locateStatus === 'locating'
  return (
    // Hidden while the phone's sheet is pulled up: the map is mostly covered and they'd run into the header.
    <div className="absolute right-4 bottom-[calc(var(--sheet-height,0px)+2.25rem)] z-[1000] flex flex-col items-end gap-2 transition-[bottom] in-data-[dragging]:transition-none in-data-[sheet=expanded]:hidden lg:right-4 lg:bottom-10 lg:in-data-[sheet=expanded]:flex">
      <LayersControl buttonClass={controlButton} />
      <button type="button" onClick={() => locate()} disabled={locating} aria-label="Show my location"
        className={`${controlButton} rounded-md border border-border-muted shadow-float`}>
        {locating
          ? <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
          : <Icon name="my_location" className={`text-[20px] ${locateStatus === 'found' ? 'text-primary' : ''}`} />}
      </button>
      <div className="hidden flex-col overflow-hidden rounded-md border border-border-muted shadow-float lg:flex">
        <button type="button" onClick={() => map?.zoomIn()} aria-label="Zoom in" className={controlButton}>
          <Icon name="add" className="text-[20px]" />
        </button>
        <span className="h-px bg-border-muted" aria-hidden />
        <button type="button" onClick={() => map?.zoomOut()} aria-label="Zoom out" className={controlButton}>
          <Icon name="remove" className="text-[20px]" />
        </button>
      </div>
      {/* Phones: the main action floats just above the sheet; desktop has it in the header. */}
      {!reporting && <Link to="/report"
        className="mt-1 flex h-11 items-center gap-1.5 rounded-md bg-hazard-closure-red pr-4 pl-3 text-label-lg text-white shadow-float lg:hidden">
        <Icon name="add" className="text-[20px]" />
        Report
      </Link>}
    </div>
  )
}

/** Strip along the top of the map where a page can put controls, such as the facility filters on phones. */
function OverlaySlot() {
  const { setOverlay } = useAppMap()
  return <div ref={setOverlay} className="pointer-events-none absolute inset-x-0 top-0 z-[1000] *:pointer-events-auto" />
}

/** Short message over the map (e.g. location blocked); goes away by itself. */
function MapNotice() {
  const { notice, showNotice } = useAppMap()
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => showNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice, showNotice])
  if (!notice) return null
  return (
    <div role="status" className="absolute inset-x-3 top-[calc(var(--map-top,0px)+0.75rem)] z-[1001] mx-auto flex max-w-md items-start gap-3 rounded-md bg-inverse-surface px-3.5 py-2.5 text-body-md text-inverse-on-surface shadow-float">
      <Icon name="info" className="text-[20px]" />
      <p className="flex-1">{notice}</p>
      <button type="button" onClick={() => showNotice(null)} aria-label="Dismiss" className="-my-1 -mr-1 grid size-8 place-items-center rounded-md hover:bg-white/10">
        <Icon name="close" className="text-[20px]" />
      </button>
    </div>
  )
}

/** The map background: the grey street map, or satellite photos. */
function Background() {
  const tiles = useBaseMap() === 'satellite' ? SATELLITE_TILES : TILES
  // One layer whose address and credits change, so the credits never list both backgrounds.
  return <TileLayer url={tiles.url} attribution={tiles.attribution} maxZoom={MAX_ZOOM} />
}

/** The shared map of Kathmandu District: tiles, scale, the user's position, and the map buttons. */
export function MapView() {
  const [view] = useState(savedView)  // only the starting view; after that the map keeps its own
  const base = useBaseMap()
  return (
    <div data-base-map={base} className="relative isolate size-full">
      <MapContainer center={view.center} zoom={view.zoom} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}
        maxBounds={PANNING_BOUNDS} maxBoundsViscosity={0.9} zoomControl={false} attributionControl={false}
        className="size-full">
        {/* The credits box comes before the background, so the background's credit is counted once (in development
            React mounts everything twice, and the other order would count it twice and never clear it). */}
        <AttributionControl position="bottomright" prefix={false} />
        <Background />
        <ScaleControl position="bottomleft" imperial={false} />
        <ShareMap />
        <RememberView />
        <FitContainer />
        <DropPin />
        <YouAreHere />
      </MapContainer>
      <OverlaySlot />
      {/* Desktop: the choice of background floats in the corner; phones have it in the layers panel. */}
      <BaseMapSwitch className="absolute top-4 right-4 z-[1000] hidden shadow-float lg:flex" />
      <MapControls />
      <MapNotice />
    </div>
  )
}
