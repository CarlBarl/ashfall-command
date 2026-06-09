import { useEffect } from 'react'
import { useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { MapboxOverlayProps } from '@deck.gl/mapbox'

export default function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({
      ...props,
      interleaved: false, // overlay mode — reliable picking
    }),
  )
  overlay.setProps(props)

  // The overlay canvas's first frame can composite as opaque black, hiding the
  // basemap; any later redraw clears correctly. The game starts paused, so without
  // this burst nothing would trigger that redraw and the black frame would stick.
  useEffect(() => {
    let frames = 0
    let raf = requestAnimationFrame(function kick() {
      const deck = (overlay as unknown as { _deck?: { redraw?: (reason?: string) => void } })._deck
      deck?.redraw?.('post-mount-clear')
      if (++frames < 60) raf = requestAnimationFrame(kick)
    })
    return () => cancelAnimationFrame(raf)
  }, [overlay])

  return null
}
