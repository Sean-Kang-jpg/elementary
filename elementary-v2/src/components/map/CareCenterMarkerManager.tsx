import { useEffect } from 'react'
import { HeartHandshake, X } from 'lucide-react'
import type { CareCenter } from '../../types'
import { useAppContext } from '../../contexts/AppContext'

interface CareCenterMarkerManagerProps {
  map: NaverMap
  centers: CareCenter[]
  onClose: () => void
}

/**
 * School-origin care centers in the fixed 1km layer. Marker selection uses
 * the same detail sheet as other map entities, rather than an SDK popup.
 */
export default function CareCenterMarkerManager({ map, centers, onClose }: CareCenterMarkerManagerProps) {
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
          content: '<div class="care-map-marker" aria-hidden="true">돌봄</div>',
          anchor: new maps.Point(15, 15),
        },
        zIndex: 540,
      })
      listeners.push(maps.Event.addListener(marker, 'click', () => {
        dispatch({ type: 'SET_SELECTED_MAP_PLACE', payload: { kind: 'care', data: center } })
      }))
      return marker
    })
    const bounds = new maps.LatLngBounds(markers[0].getPosition(), markers[0].getPosition())
    markers.forEach((marker) => bounds.extend(marker.getPosition()))
    map.fitBounds(bounds, { top: 140, right: 60, bottom: 260, left: 60 })
    return () => {
      listeners.forEach((listener) => {
        try { maps.Event.removeListener(listener) } catch { /* The SDK may release listeners first. */ }
      })
      markers.forEach((marker) => {
        try { marker.setMap(null) } catch { /* Map teardown can release markers first. */ }
      })
    }
  }, [centers, dispatch, map])

  if (!centers.length) return null
  return (
    <div className="care-map-chip absolute left-3 inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 bg-white/95 pl-3 pr-1 text-sm font-semibold text-rose-800 shadow-md sm:left-5" data-testid="care-map-chip">
      <HeartHandshake size={17} aria-hidden="true" />
      돌봄센터 {centers.length}곳
      <button type="button" onClick={() => { dispatch({ type: 'SET_SELECTED_MAP_PLACE', payload: null }); onClose() }} aria-label="돌봄센터 지도 표시 닫기" className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
