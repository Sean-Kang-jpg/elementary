import { useEffect, useRef } from 'react'
import type { Apartment } from '../../types'

interface ApartmentMarkerProps {
  apartment: Apartment
  map: NaverMap
  selected: boolean
  onClick: (apartment: Apartment) => void
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

type ApartmentMarkerTier = 'dot' | 'small' | 'medium' | 'large' | 'xlarge'

const markerTier = (households: number): ApartmentMarkerTier => {
  if (households < 100) return 'dot'
  if (households < 500) return 'small'
  if (households < 1000) return 'medium'
  if (households < 2000) return 'large'
  return 'xlarge'
}

const markerDimensions: Record<ApartmentMarkerTier, { width: number; height: number }> = {
  dot: { width: 24, height: 24 },
  small: { width: 64, height: 32 },
  medium: { width: 72, height: 34 },
  large: { width: 82, height: 36 },
  xlarge: { width: 94, height: 40 },
}

const markerContent = (apartment: Apartment, selected: boolean, tier: ApartmentMarkerTier) => `
  <div class="apartment-map-marker apartment-map-marker--${tier}${selected ? ' apartment-map-marker--selected' : ''}" data-apartment-id="${escapeHtml(apartment.id)}">
    ${tier === 'dot' ? '<span class="apartment-map-marker__dot" aria-hidden="true"></span>' : `
    <span class="apartment-map-marker__label" aria-hidden="true">
      <strong>${apartment.households.toLocaleString('ko-KR')}</strong>
      <small>세대</small>
    </span>`}
  </div>
`

export default function ApartmentMarker({ apartment, map, selected, onClick }: ApartmentMarkerProps) {
  const markerRef = useRef<Marker | null>(null)

  useEffect(() => {
    const maps = window.naver?.maps
    if (!maps || !apartment.latitude || !apartment.longitude) return

    const tier = markerTier(apartment.households)
    const dimensions = markerDimensions[tier]
    const baseZIndex = tier === 'dot'
      ? 100
      : 300 + Math.min(Math.round(apartment.households / 10), 500)
    const restingZIndex = selected ? 900 : baseZIndex
    const marker = new maps.Marker({
      position: new maps.LatLng(apartment.latitude, apartment.longitude),
      map,
      title: `${apartment.name}, ${apartment.households.toLocaleString('ko-KR')}세대`,
      icon: {
        content: markerContent(apartment, selected, tier),
        anchor: tier === 'dot'
          ? new maps.Point(dimensions.width / 2, dimensions.height / 2)
          : new maps.Point(dimensions.width / 2, dimensions.height + 5),
      },
      zIndex: restingZIndex,
    })
    markerRef.current = marker

    const clickListener = maps.Event.addListener(marker, 'click', () => onClick(apartment))
    const mouseoverListener = maps.Event.addListener(marker, 'mouseover', () => marker.setZIndex(950))
    const mouseoutListener = maps.Event.addListener(marker, 'mouseout', () => marker.setZIndex(restingZIndex))

    return () => {
      maps.Event.removeListener(clickListener)
      maps.Event.removeListener(mouseoverListener)
      maps.Event.removeListener(mouseoutListener)
      marker.setMap(null)
      markerRef.current = null
    }
  }, [apartment, map, onClick, selected])

  return null
}
