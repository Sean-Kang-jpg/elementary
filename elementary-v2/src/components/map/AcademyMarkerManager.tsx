import { useEffect, useMemo, useState } from 'react'
import { getAcademiesNearApartment, getAcademiesNearSchool } from '../../services/dataService'
import type { AcademyAddress, Apartment, School } from '../../types'
import {
  ACADEMY_CATEGORIES,
  academyHasCategory,
  getAcademyCategory,
  getAcademyCategoryCounts,
  getDominantAcademyCategory,
  type AcademyCategoryKey,
} from '../../utils/academyCategories'

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

const markerSize = (count: number) => count >= 5 ? 'large' : count >= 2 ? 'medium' : 'small'

const markerContent = (academy: AcademyAddress, selectedCategory: AcademyCategoryKey | null) => {
  const category = selectedCategory ? getAcademyCategory(selectedCategory) : getDominantAcademyCategory(academy)
  const countBadge = academy.institution_count > 1
    ? `<span class="academy-map-marker__count">+${Math.min(academy.institution_count, 99)}</span>`
    : ''
  return `
    <div class="academy-map-marker academy-map-marker--${academy.distance_band} academy-map-marker--${markerSize(academy.institution_count)}" style="--academy-color:${category.color};--academy-soft:${category.softColor}" title="${escapeHtml(category.label)} · ${academy.straight_distance_m.toLocaleString('ko-KR')}m">
      <strong aria-hidden="true">${category.shortLabel}</strong>${countBadge}
    </div>
  `
}

const clusterRows = (rows: AcademyAddress[], zoom: number): AcademyCluster[] => {
  if (zoom >= 15) return rows.map((row) => ({ id: row.address_id, latitude: row.latitude, longitude: row.longitude, rows: [row] }))
  const cellSize = zoom <= 12 ? 0.012 : zoom === 13 ? 0.007 : 0.004
  const groups = new Map<string, AcademyAddress[]>()
  rows.forEach((row) => {
    const key = `${Math.round(row.latitude / cellSize)}:${Math.round(row.longitude / cellSize)}`
    groups.set(key, [...(groups.get(key) || []), row])
  })
  return [...groups.entries()].map(([id, groupedRows]) => ({
    id,
    latitude: groupedRows.reduce((sum, row) => sum + row.latitude, 0) / groupedRows.length,
    longitude: groupedRows.reduce((sum, row) => sum + row.longitude, 0) / groupedRows.length,
    rows: groupedRows,
  }))
}

const academyPopupContent = (academy: AcademyAddress) => {
  const categories = ACADEMY_CATEGORIES
    .map((category) => ({ ...category, count: getAcademyCategoryCounts(academy)[category.key] }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count)
  const institutionRows = academy.institutions.length
    ? academy.institutions.map((institution) => `<tr>
        <th scope="row">${escapeHtml(institution.name)}</th>
        <td>${escapeHtml(institution.type || '미상')}</td>
        <td>${escapeHtml(institution.realm || '미상')}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="academy-map-popup__empty">학원명 정보를 준비 중입니다.</td></tr>`
  return `<div class="academy-map-popup">
    <div class="academy-map-popup__header"><strong>교육시설 ${academy.institution_count.toLocaleString('ko-KR')}곳</strong><span>${academy.distance_band === 'core' ? '핵심권역' : '확장권역'}</span></div>
    <p>${categories.map(({ label, count }) => `${escapeHtml(label)} ${count.toLocaleString('ko-KR')}`).join(' · ') || '분야 정보 없음'}</p>
    <div class="academy-map-popup__table-wrap">
      <table><thead><tr><th>학원명</th><th>유형</th><th>분야</th></tr></thead><tbody>${institutionRows}</tbody></table>
    </div>
    <small>직선거리 ${academy.straight_distance_m.toLocaleString('ko-KR')}m</small>
  </div>`
}

export default function AcademyMarkerManager({ map, apartment, school, enabled, selectedCategory, onCategoryChange, onCountChange }: AcademyMarkerManagerProps) {
  const [academies, setAcademies] = useState<AcademyAddress[]>([])
  const [zoom, setZoom] = useState(map.getZoom())
  const filteredAcademies = useMemo(
    () => academies.filter((academy) => academyHasCategory(academy, selectedCategory)),
    [academies, selectedCategory],
  )

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
        title: isCluster ? `교육시설 주소 ${cluster.rows.length}개` : `교육시설 ${institutionCount.toLocaleString('ko-KR')}곳`,
        icon: {
          content: isCluster
            ? `<div class="academy-map-cluster"><strong>${cluster.rows.length}</strong><span>주소</span></div>`
            : markerContent(cluster.rows[0], selectedCategory),
          anchor: new maps.Point(isCluster ? 27 : 20, isCluster ? 27 : 22),
        },
        zIndex: isCluster ? 530 : cluster.rows[0].distance_band === 'core' ? 520 : 510,
      })
      listeners.push(maps.Event.addListener(marker, 'click', () => {
        if (isCluster) {
          const bounds = new maps.LatLngBounds(marker.getPosition(), marker.getPosition())
          cluster.rows.forEach((row) => bounds.extend(new maps.LatLng(row.latitude, row.longitude)))
          map.fitBounds(bounds, { top: 80, right: 80, bottom: 120, left: 80 })
          return
        }
        infoWindow?.close()
        infoWindow = new maps.InfoWindow({
          content: academyPopupContent(cluster.rows[0]),
          maxWidth: 280,
          backgroundColor: 'transparent',
          borderWidth: 0,
          anchorSize: new maps.Size(0, 0),
          pixelOffset: new maps.Point(0, -18),
        })
        infoWindow.open(map, marker)
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

  if (!enabled || !academies.length) return null

  const selectedLabel = selectedCategory ? getAcademyCategory(selectedCategory).label : '전체 분야'
  return (
    <div className="academy-map-legend absolute bottom-4 left-3 rounded-lg border border-gray-200 bg-white/95 p-2.5 shadow-lg backdrop-blur sm:left-5" aria-label="학원 지도 범례">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-xs text-gray-800">{selectedLabel}</strong>
        {selectedCategory ? <button type="button" onClick={() => onCategoryChange(null)} className="text-[11px] font-semibold text-blue-700 hover:text-blue-900">전체 보기</button> : null}
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-600">
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-blue-600" />핵심 600m</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-blue-300" />확장 800m</span>
        <span>+N 복합상가</span>
      </div>
    </div>
  )
}
