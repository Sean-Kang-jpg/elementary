import { useEffect } from 'react'
import type { CareCenter } from '../../types'
import { useAppContext } from '../../contexts/AppContext'
import { CARE_MARKER_ART } from '../../utils/mapMarkerArt'

interface CareCenterMarkerManagerProps {
  map: NaverMap
  centers: CareCenter[]
}

/**
 * School-origin care centers in the fixed 1km layer. Marker selection uses
 * the same detail sheet as other map entities, rather than an SDK popup.
 */
export default function CareCenterMarkerManager({ map, centers }: CareCenterMarkerManagerProps) {
  const { dispatch } = useAppContext()
  useEffect(() => {
    const maps = window.naver?.maps
    if (!maps || !centers.length) return
    const listeners: unknown[] = []
    const markers = centers.map((center) => {
      const marker = new maps.Marker({
        position: new maps.LatLng(center.latitude, center.longitude),
        map,
        title: center.name,
        icon: {
          content: `<div class="care-map-marker" aria-hidden="true">${CARE_MARKER_ART}<strong>돌봄</strong></div>`,
          anchor: new maps.Point(29, 17),
        },
        zIndex: 540,
      })
      listeners.push(maps.Event.addListener(marker, 'click', () => {
        dispatch({ type: 'SET_SELECTED_MAP_PLACE', payload: { kind: 'care', data: center } })
      }))
      return marker
    })
    return () => {
      listeners.forEach((listener) => {
        try { maps.Event.removeListener(listener) } catch { /* The SDK may release listeners first. */ }
      })
      markers.forEach((marker) => {
        try { marker.setMap(null) } catch { /* Map teardown can release markers first. */ }
      })
    }
  }, [centers, dispatch, map])

  // Visibility and count are controlled by the shared map-layer panel.
  return null
}
