import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { getAcademiesNearApartment, getAcademiesNearSchool } from '../../services/dataService'
import type { AcademyAddress, Apartment, School } from '../../types'
import {
  academyHasCategory,
  getAcademyCategory,
  getDominantAcademyCategory,
  type AcademyCategoryKey,
} from '../../utils/academyCategories'
import { useAppContext } from '../../contexts/AppContext'

interface AcademyMarkerManagerProps {
  map: NaverMap
  apartment?: Apartment | null
  school?: School | null
  enabled: boolean
  selectedCategory: AcademyCategoryKey | null
  onCategoryChange: (category: AcademyCategoryKey | null) => void
  onCountChange: (count: number | null) => void
}

interface AcademyCluster {
  id: string
  band: AcademyAddress['distance_band']
  latitude: number
  longitude: number
  rows: AcademyAddress[]
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const bandLabel = (band: AcademyAddress['distance_band']) => band === 'core' ? '핵심권역' : '확장권역'

const markerSize = (count: number) => count >= 5 ? 'large' : count >= 2 ? 'medium' : 'small'

const markerContent = (academy: AcademyAddress, selectedCategory: AcademyCategoryKey | null) => {
  const category = selectedCategory ? getAcademyCategory(selectedCategory) : getDominantAcademyCategory(academy)
  const countBadge = academy.institution_count > 1
    ? `<span class="academy-map-marker__count">+${Math.min(academy.institution_count, 99)}</span>`
    : ''
  return `
    <div class="academy-map-marker academy-map-marker--${academy.distance_band} academy-map-marker--${markerSize(academy.institution_count)}" style="--academy-color:${category.color};--academy-soft:${category.softColor}" title="${escapeHtml(category.label)} · ${bandLabel(academy.distance_band)} · ${academy.straight_distance_m.toLocaleString('ko-KR')}m">
      <strong aria-hidden="true">${category.shortLabel}</strong>${countBadge}
    </div>
  `
}

const clusterRows = (rows: AcademyAddress[], zoom: number): AcademyCluster[] => {
  if (zoom >= 15) return rows.map((row) => ({ id: row.address_id, band: row.distance_band, latitude: row.latitude, longitude: row.longitude, rows: [row] }))
  const cellSize = zoom <= 12 ? 0.012 : zoom === 13 ? 0.007 : 0.004
  const groups = new Map<string, AcademyAddress[]>()
  rows.forEach((row) => {
    // Bands never share a cluster, so a cluster's style can say which band it is.
    const key = `${row.distance_band}:${Math.round(row.latitude / cellSize)}:${Math.round(row.longitude / cellSize)}`
    groups.set(key, [...(groups.get(key) || []), row])
  })
  return [...groups.entries()].map(([id, groupedRows]) => ({
    id,
    band: groupedRows[0].distance_band,
    latitude: groupedRows.reduce((sum, row) => sum + row.latitude, 0) / groupedRows.length,
    longitude: groupedRows.reduce((sum, row) => sum + row.longitude, 0) / groupedRows.length,
    rows: groupedRows,
  }))
}

export default function AcademyMarkerManager({ map, apartment, school, enabled, selectedCategory, onCategoryChange, onCountChange }: AcademyMarkerManagerProps) {
  const { dispatch } = useAppContext()
  const [academies, setAcademies] = useState<AcademyAddress[]>([])
  const [zoom, setZoom] = useState(map.getZoom())
  // The legend covers part of the map, so it can be closed while the markers stay.
  // It comes back whenever the layer is turned on again or the selection changes.
  const [legendDismissed, setLegendDismissed] = useState(false)
  const filteredAcademies = useMemo(
    () => academies.filter((academy) => academyHasCategory(academy, selectedCategory)),
    [academies, selectedCategory],
  )

  useEffect(() => {
    setLegendDismissed(false)
  }, [apartment?.id, enabled, school?.school_id])

  useEffect(() => {
    let active = true
    if (!enabled) {
      setAcademies([])
      onCountChange(null)
      return () => { active = false }
    }
    onCountChange(-1)
    const request = apartment?.id
      ? getAcademiesNearApartment(apartment.id)
      : school?.school_id
        ? getAcademiesNearSchool(school.school_id)
        : Promise.resolve([])
    request
      .then((rows) => {
        if (!active) return
        setAcademies(rows)
        onCountChange(rows.reduce((sum, row) => sum + row.institution_count, 0))
      })
      .catch((error) => {
        console.error('Failed to load nearby academy markers:', error)
        if (active) onCountChange(null)
      })
    return () => { active = false }
  }, [apartment?.id, enabled, onCountChange, school?.school_id])

  useEffect(() => {
    const maps = window.naver?.maps
    if (!maps || !enabled) return
    const listener = maps.Event.addListener(map, 'idle', () => setZoom(map.getZoom()))
    return () => {
      try { maps.Event.removeListener(listener) } catch { /* The map may already be released. */ }
    }
  }, [enabled, map])

  useEffect(() => {
    const maps = window.naver?.maps
    if (!maps || !enabled) return
    const listeners: unknown[] = []
    const clusters = clusterRows(filteredAcademies, zoom)
    const markers = clusters.map((cluster) => {
      const isCluster = cluster.rows.length > 1 && zoom < 15
      const institutionCount = cluster.rows.reduce((sum, row) => sum + row.institution_count, 0)
      const marker = new maps.Marker({
        position: new maps.LatLng(cluster.latitude, cluster.longitude),
        map,
        title: isCluster ? `${bandLabel(cluster.band)} 교육시설 주소 ${cluster.rows.length}개` : `${bandLabel(cluster.band)} 교육시설 ${institutionCount.toLocaleString('ko-KR')}곳`,
        icon: {
          content: isCluster
            ? `<div class="academy-map-cluster academy-map-cluster--${cluster.band}"><strong>${cluster.rows.length}</strong><span>${cluster.band === 'core' ? '핵심' : '확장'}</span></div>`
            : markerContent(cluster.rows[0], selectedCategory),
          anchor: new maps.Point(isCluster ? 27 : 20, isCluster ? 27 : 22),
        },
        zIndex: (cluster.band === 'core' ? 520 : 500) + (isCluster ? 10 : 0),
      })
      listeners.push(maps.Event.addListener(marker, 'click', () => {
        if (isCluster) {
          const bounds = new maps.LatLngBounds(marker.getPosition(), marker.getPosition())
          cluster.rows.forEach((row) => bounds.extend(new maps.LatLng(row.latitude, row.longitude)))
          map.fitBounds(bounds, { top: 80, right: 80, bottom: 120, left: 80 })
          return
        }
        dispatch({ type: 'SET_SELECTED_MAP_PLACE', payload: { kind: 'activity', data: cluster.rows[0] } })
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
  }, [dispatch, enabled, filteredAcademies, map, selectedCategory, zoom])

  if (!enabled || !academies.length || legendDismissed) return null

  const selectedLabel = selectedCategory ? getAcademyCategory(selectedCategory).label : '전체 분야'
  return (
    <div className="academy-map-legend absolute right-3 rounded-lg border border-gray-200 bg-white/95 p-2.5 shadow-lg backdrop-blur sm:right-5" aria-label="교육시설 지도 범례">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-xs text-gray-800">{selectedLabel}</strong>
        <div className="flex items-center gap-2">
          {selectedCategory ? <button type="button" onClick={() => onCategoryChange(null)} className="text-[11px] font-semibold text-blue-700 hover:text-blue-900">전체 보기</button> : null}
          <button type="button" onClick={() => setLegendDismissed(true)} aria-label="교육시설 범례 닫기" title="범례 닫기" className="-m-1.5 inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-600">
        <span className="inline-flex items-center gap-1"><i className="academy-legend-swatch academy-legend-swatch--core" aria-hidden="true" />핵심 ~600m</span>
        <span className="inline-flex items-center gap-1"><i className="academy-legend-swatch academy-legend-swatch--extended" aria-hidden="true" />확장 600~800m</span>
        <span>+N 복합상가</span>
      </div>
    </div>
  )
}
