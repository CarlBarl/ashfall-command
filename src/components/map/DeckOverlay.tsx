import { useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { MapboxOverlayProps } from '@deck.gl/mapbox'

export default function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({ ...props, interleaved: true }),
  )
  overlay.setProps(props)
  return null
}
