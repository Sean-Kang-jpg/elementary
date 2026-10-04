import { useEffect } from 'react'
import { HeartHandshake, X } from 'lucide-react'
import type { CareCenter } from '../../types'
import { closablePopup, keepPopupClearOfMapControls, POPUP_CLOSE_BUTTON } from '../../utils/mapPopup'

interface CareCenterMarkerManagerProps {
  map: NaverMap
  centers: CareCenter[]
  onClose: () => void
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const hoursText = (value: string | null) => value ? value.replace('~', ' ~ ') : '미입력'

const popupContent = (center: CareCenter) => `
  <div class="care-map-popup">
    <div class="care-map-popup__header"><strong>${escapeHtml(center.name)}</strong>${POPUP_CLOSE_BUTTON}</div>
    <div>${escapeHtml(center.center_kind)} · ${center.straight_distance_m.toLocaleString('ko-KR')}m${center.capacity ? ` · 정원 ${center.capacity}명` : ''}</div>
    <div>학기 중 ${escapeHtml(hoursText(center.term_hours))}</div>
    <div>방학 중 ${escapeHtml(hoursText(center.vacation_hours))}</div>
  </div>
`

/**
 * The care centers a detail screen listed, drawn on the map. The list is passed
 * in with the event that opens this layer, so the map shows exactly what the
 * sheet showed and reads nothing itself.
 */
export default function CareCenterMarkerManager({ map, centers, onClose }: CareCenterMarkerManagerProps) {
  useEffect(() => {
    const maps = window.naver?.maps
    if (!maps || !centers.length) return
    let infoWindow: InfoWindow | null = null
    const listeners: unknown[] = [maps.Event.addListener(map, 'click', () => infoWindow?.close())]
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
        infoWindow?.close()
        const content = closablePopup(popupContent(center), () => infoWindow?.close())
        infoWindow = new maps.InfoWindow({
          content,
          maxWidth: 280,
          backgroundColor: 'transparent',
          borderWidth: 0,
          anchorSize: new maps.Size(0, 0),
          pixelOffset: new maps.Point(0, -18),
        })
        infoWindow.open(map, marker)
        keepPopupClearOfMapControls(map, content)
      }))
      return marker
    })
    const bounds = new maps.LatLngBounds(markers[0].getPosition(), markers[0].getPosition())
    markers.forEach((marker) => bounds.extend(marker.getPosition()))
    map.fitBounds(bounds, { top: 140, right: 60, bottom: 260, left: 60 })
    return () => {
      infoWindow?.close()
      listeners.forEach((listener) => {
        try { maps.Event.removeListener(listener) } catch { /* The SDK may release listeners first. */ }
      })
      markers.forEach((marker) => {
        try { marker.setMap(null) } catch { /* Map teardown can release markers first. */ }
      })
    }
  }, [centers, map])

  if (!centers.length) return null
  return (
    <div className="care-map-chip absolute left-3 inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 bg-white/95 pl-3 pr-1 text-sm font-semibold text-rose-800 shadow-md sm:left-5" data-testid="care-map-chip">
      <HeartHandshake size={17} aria-hidden="true" />
      돌봄센터 {centers.length}곳
      <button type="button" onClick={onClose} aria-label="돌봄센터 지도 표시 닫기" className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
