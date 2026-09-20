import { useEffect, useRef, useState } from 'react'
import { getAcademiesNearApartment } from '../../services/dataService'
import type { AcademyAddress, Apartment } from '../../types'

interface AcademyMarkerManagerProps {
  map: NaverMap
  apartment: Apartment
  enabled: boolean
  onCountChange: (count: number | null) => void
}

const markerContent = (academy: AcademyAddress) => `
  <div class="academy-map-marker academy-map-marker--${academy.distance_band}" title="${academy.straight_distance_m.toLocaleString('ko-KR')}m">
    <strong>${academy.institution_count.toLocaleString('ko-KR')}</strong>
  </div>
`

export default function AcademyMarkerManager({ map, apartment, enabled, onCountChange }: AcademyMarkerManagerProps) {
  const [academies, setAcademies] = useState<AcademyAddress[]>([])
  const markersRef = useRef<Marker[]>([])

  useEffect(() => {
    let active = true
    if (!enabled) {
      setAcademies([])
      onCountChange(null)
      return () => { active = false }
    }
    onCountChange(-1)
    getAcademiesNearApartment(apartment.id)
      .then((rows) => {
        if (!active) return
        setAcademies(rows)
        onCountChange(rows.length)
      })
      .catch((error) => {
        console.error('Failed to load nearby academy markers:', error)
        if (active) onCountChange(null)
      })
    return () => { active = false }
  }, [apartment.id, enabled, onCountChange])

  useEffect(() => {
    const maps = window.naver?.maps
    if (!maps || !enabled) return
    const markers = academies.map((academy) => new maps.Marker({
      position: new maps.LatLng(academy.latitude, academy.longitude),
      map,
      title: `학원·교습소 ${academy.institution_count.toLocaleString('ko-KR')}곳, 직선거리 ${academy.straight_distance_m.toLocaleString('ko-KR')}m`,
      icon: {
        content: markerContent(academy),
        anchor: new maps.Point(18, 18),
      },
      zIndex: academy.distance_band === 'core' ? 520 : 510,
    }))
    markersRef.current = markers
    return () => {
      markers.forEach((marker) => {
        try { marker.setMap(null) } catch { /* Map teardown can release markers first. */ }
      })
      markersRef.current = []
    }
  }, [academies, enabled, map])

  return null
}
