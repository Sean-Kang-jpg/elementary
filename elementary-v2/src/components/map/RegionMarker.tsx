import { useEffect, useRef } from 'react'
import type { RegionData } from '../../services/dataService'

interface RegionMarkerProps {
  region: RegionData
  map: NaverMap
  onClick?: (region: RegionData) => void
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

/**
 * Province and metropolitan-city marker, shown when the map is zoomed out past
 * the district level. Without it the map is empty at those zooms.
 */
const RegionMarker: React.FC<RegionMarkerProps> = ({ region, map, onClick }) => {
  const markerRef = useRef<Marker | null>(null)

  useEffect(() => {
    const maps = window.naver?.maps
    if (!map || !maps || !region.center.lat || !region.center.lng) return

    const label = escapeHtml(region.region_name || region.region)
    const schools = region.total_schools.toLocaleString('ko-KR')
    const content = `<div class="school-cluster-marker school-cluster-marker--region">
        <strong>${label}</strong>
        <span>${schools}개교</span>
      </div>`
    const marker = new maps.Marker({
      position: new maps.LatLng(region.center.lat, region.center.lng),
      map,
      title: `${region.region_name || region.region} ${schools}개교`,
      icon: {
        content,
        anchor: new maps.Point(44, 18),
      },
      zIndex: 180,
    })
    markerRef.current = marker

    const clickListener = maps.Event.addListener(marker, 'click', () => onClick?.(region))
    const mouseoverListener = maps.Event.addListener(marker, 'mouseover', () => marker.setZIndex(600))
    const mouseoutListener = maps.Event.addListener(marker, 'mouseout', () => marker.setZIndex(180))

    return () => {
      try {
        maps.Event.removeListener(clickListener)
        maps.Event.removeListener(mouseoverListener)
        maps.Event.removeListener(mouseoutListener)
      } catch {
        // The map may already be torn down.
      }
      marker.setMap(null)
      markerRef.current = null
    }
  }, [map, region, onClick])

  return null
}

export default RegionMarker
