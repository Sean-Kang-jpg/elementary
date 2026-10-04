import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { getAcademiesNearApartment, getAcademiesNearSchool } from '../../services/dataService'
import type { AcademyAddress, Apartment, School } from '../../types'
import {
  ACADEMY_CATEGORIES,
  academyHasCategory,
  getAcademyCategory,
  getAcademyCategoryCounts,
  getDominantAcademyCategory,
  getInstitutionCategories,
  type AcademyCategoryKey,
} from '../../utils/academyCategories'
import { closablePopup, keepPopupClearOfMapControls, POPUP_CLOSE_BUTTON } from '../../utils/mapPopup'

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

// Each institution leads with the category chip its marker colour comes from, so a
// mixed building reads at a glance; the list is ordered by category to group the colours.
const categoryChip = ({ label, color, softColor }: { label: string, color: string, softColor: string }, count?: number) => (
  `<span class="academy-chip" style="--academy-color:${color};--academy-soft:${softColor}">${escapeHtml(label)}${count === undefined ? '' : ` <b>${count.toLocaleString('ko-KR')}</b>`}</span>`
)

const academyPopupContent = (academy: AcademyAddress) => {
  const counts = getAcademyCategoryCounts(academy)
  const categories = ACADEMY_CATEGORIES
    .map((category) => ({ ...category, count: counts[category.key] }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count)
  const order = (key: AcademyCategoryKey) => ACADEMY_CATEGORIES.findIndex((category) => category.key === key)
  const institutions = academy.institutions
    .map((institution) => ({ ...institution, categories: getInstitutionCategories(institution) }))
    .sort((a, b) => order(a.categories[0].key) - order(b.categories[0].key) || a.name.localeCompare(b.name, 'ko'))
  const institutionRows = institutions.length
    ? institutions.map((institution) => `<li>
        <span class="academy-map-popup__chips">${institution.categories.map((category) => categoryChip(category)).join('')}</span>
        <span class="academy-map-popup__name"><strong>${escapeHtml(institution.name)}</strong><small>${escapeHtml([institution.type, institution.realm].filter(Boolean).join(' · ') || '미상')}</small></span>
      </li>`).join('')
    : '<li class="academy-map-popup__empty">기관명 정보를 준비 중입니다.</li>'
  return `<div class="academy-map-popup">
    <div class="academy-map-popup__header"><strong>교육시설 ${academy.institution_count.toLocaleString('ko-KR')}곳</strong><span>${bandLabel(academy.distance_band)}</span>${POPUP_CLOSE_BUTTON}</div>
    <div class="academy-map-popup__summary">${categories.map((category) => categoryChip(category, category.count)).join('') || '<span>분야 정보 없음</span>'}</div>
    <ul class="academy-map-popup__list">${institutionRows}</ul>
    <small>직선거리 ${academy.straight_distance_m.toLocaleString('ko-KR')}m</small>
  </div>`
}

export default function AcademyMarkerManager({ map, apartment, school, enabled, selectedCategory, onCategoryChange, onCountChange }: AcademyMarkerManagerProps) {
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
    let infoWindow: InfoWindow | null = null
    const listeners: unknown[] = []
    listeners.push(maps.Event.addListener(map, 'click', () => infoWindow?.close()))
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
        infoWindow?.close()
        const content = closablePopup(academyPopupContent(cluster.rows[0]), () => infoWindow?.close())
        infoWindow = new maps.InfoWindow({
          content,
          maxWidth: 300,
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
    return () => {
      infoWindow?.close()
      listeners.forEach((listener) => {
        try { maps.Event.removeListener(listener) } catch { /* The SDK may release listeners first. */ }
      })
      markers.forEach((marker) => {
        try { marker.setMap(null) } catch { /* Map teardown can release markers first. */ }
      })
    }
  }, [enabled, filteredAcademies, map, selectedCategory, zoom])

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
