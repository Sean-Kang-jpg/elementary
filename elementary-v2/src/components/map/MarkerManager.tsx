/**
 * 마커 관리 컴포넌트
 * 줌 레벨에 따라 개별 마커 또는 클러스터 마커를 표시
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useAppContext } from '../../contexts/AppContext'
import { fetchDistrictOverviewData, fetchRegionData, fetchSchoolsByAdministrativeArea, fetchSchoolsByIds } from '../../services/dataService'
import { ClusterPoint, getSchoolNeighborhoodLabel, groupSchoolsByDistrict, groupSchoolsByNeighborhood } from '../../utils/clusterUtils'
import { getDisplayMode } from '../../utils/mapUtils'
import { MapBounds, School } from '../../types'
import SchoolMarker from './SchoolMarker'
import ClusterMarker from './ClusterMarker'
import DistrictNeighborhoodSheet from './DistrictNeighborhoodSheet'
import NeighborhoodSchoolSheet from './NeighborhoodSchoolSheet'

interface MarkerManagerProps {
  map: NaverMap | null
}

interface DistrictScope {
  region: string
  district: string
}

interface ViewportSnapshot {
  center: { lat: number; lng: number }
  zoom: number
}

const DISTRICT_SHEET_RATIO = 0.32
const NEIGHBORHOOD_SHEET_RATIO = 0.28
const SCHOOL_SHEET_RATIO = 0.38

const clusterIntersectsBounds = (cluster: ClusterPoint, bounds: MapBounds) => (
  cluster.bounds.north >= bounds.southwest.lat
  && cluster.bounds.south <= bounds.northeast.lat
  && cluster.bounds.east >= bounds.southwest.lng
  && cluster.bounds.west <= bounds.northeast.lng
)

const MarkerManager: React.FC<MarkerManagerProps> = ({ map }) => {
  const { state, dispatch } = useAppContext()
  const [schools, setSchools] = useState<School[]>([])
  const [clusters, setClusters] = useState<ClusterPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [districtScope, setDistrictScope] = useState<DistrictScope | null>(null)
  const [neighborhoodScope, setNeighborhoodScope] = useState<string | null>(null)
  const [neighborhoodSchoolIds, setNeighborhoodSchoolIds] = useState<string[]>([])
  const districtReturnViewportRef = useRef<ViewportSnapshot | null>(null)
  const neighborhoodReturnViewportRef = useRef<ViewportSnapshot | null>(null)
  const schoolReturnViewportRef = useRef<ViewportSnapshot | null>(null)
  const previousSelectedSchoolRef = useRef<School | null>(null)
  const neighborhoodEnteredDirectlyRef = useRef(false)

  const getViewportSnapshot = useCallback((): ViewportSnapshot => {
    if (!map) return { center: state.map.center, zoom: state.map.zoom }
    const center = map.getCenter()
    return {
      center: { lat: center.lat(), lng: center.lng() },
      zoom: map.getZoom(),
    }
  }, [map, state.map.center, state.map.zoom])

  const setCamera = useCallback((viewport: ViewportSnapshot, sheetRatio = 0) => {
    const maps = window.naver?.maps
    if (!map || !maps?.LatLng) {
      dispatch({ type: 'SET_MAP_STATE', payload: viewport })
      return
    }

    map.setZoom(viewport.zoom)
    map.setCenter(new maps.LatLng(viewport.center.lat, viewport.center.lng))
    if (sheetRatio > 0 && maps.Point) {
      window.requestAnimationFrame(() => {
        map.panBy(new maps.Point(0, Math.round(window.innerHeight * sheetRatio / 2)))
      })
    }
  }, [dispatch, map])

  const keepSchoolInVisibleMap = useCallback((school: School) => {
    if (!map || !school.latitude || !school.longitude) return

    const bounds = map.getBounds()
    const northeast = bounds.getNE()
    const southwest = bounds.getSW()
    const latitudeSpan = northeast.lat() - southwest.lat()
    const longitudeSpan = northeast.lng() - southwest.lng()
    if (latitudeSpan <= 0 || longitudeSpan <= 0) return

    const x = (school.longitude - southwest.lng()) / longitudeSpan
    const y = (northeast.lat() - school.latitude) / latitudeSpan
    const safeLeft = 0.08
    const safeRight = 0.92
    const safeTop = 0.08
    const safeBottom = 1 - SCHOOL_SHEET_RATIO - 0.04
    if (x >= safeLeft && x <= safeRight && y >= safeTop && y <= safeBottom) return

    const currentCenter = map.getCenter()
    const desiredX = x < safeLeft || x > safeRight ? 0.5 : x
    const desiredY = y < safeTop || y > safeBottom
      ? (safeTop + safeBottom) / 2
      : y
    setCamera({
      zoom: map.getZoom(),
      center: {
        lat: desiredY === y
          ? currentCenter.lat()
          : school.latitude + (desiredY - 0.5) * latitudeSpan,
        lng: desiredX === x
          ? currentCenter.lng()
          : school.longitude - (desiredX - 0.5) * longitudeSpan,
      },
    })
  }, [map, setCamera])

  // 현재 표시 모드
  const displayMode = getDisplayMode(state.map.zoom)
  const shouldShowMarkers = displayMode === 'SCHOOLS' && state.map.zoom >= 11 // 줌 11부터 마커 표시

  // 학교 클릭 핸들러
  const handleSchoolClick = useCallback((school: School) => {
    schoolReturnViewportRef.current = getViewportSnapshot()
    dispatch({
      type: 'SET_SELECTED_SCHOOL',
      payload: school
    })
    window.requestAnimationFrame(() => keepSchoolInVisibleMap(school))
  }, [dispatch, getViewportSnapshot, keepSchoolInVisibleMap])

  // Move exactly one level down: district -> neighborhood -> school.
  const handleClusterClick = useCallback((cluster: ClusterPoint) => {
    const isDistrictLevel = state.map.zoom <= 12
    const nextZoom = isDistrictLevel ? 13 : 14
    if (isDistrictLevel) {
      districtReturnViewportRef.current = getViewportSnapshot()
      neighborhoodEnteredDirectlyRef.current = false
      const firstSchool = cluster.schools[0]
      setSchools([])
      setClusters([])
      setDistrictScope({
        region: firstSchool.region,
        district: cluster.label || firstSchool.district || '',
      })
      setNeighborhoodScope(null)
      setNeighborhoodSchoolIds([])
    } else {
      const firstSchool = cluster.schools[0]
      neighborhoodReturnViewportRef.current = getViewportSnapshot()
      neighborhoodEnteredDirectlyRef.current = !districtScope
      if (!districtScope) {
        setDistrictScope({
          region: firstSchool.region,
          district: firstSchool.district || firstSchool.city || firstSchool.region,
        })
      }
      setNeighborhoodScope(cluster.label || getSchoolNeighborhoodLabel(cluster.schools[0]))
      setNeighborhoodSchoolIds(cluster.schools.map((school) => school.school_id))
      setSchools(cluster.schools)
    }
    dispatch({ type: 'SET_SELECTED_SCHOOL', payload: null })
    setCamera(
      { zoom: nextZoom, center: cluster.center },
      isDistrictLevel ? DISTRICT_SHEET_RATIO : NEIGHBORHOOD_SHEET_RATIO,
    )
  }, [dispatch, districtScope, getViewportSnapshot, setCamera, state.map.zoom])

  const handleClearDistrict = useCallback(() => {
    setSchools([])
    setClusters([])
    setDistrictScope(null)
    setNeighborhoodScope(null)
    setNeighborhoodSchoolIds([])
    dispatch({ type: 'SET_SELECTED_SCHOOL', payload: null })
    const returnViewport = districtReturnViewportRef.current
    districtReturnViewportRef.current = null
    neighborhoodReturnViewportRef.current = null
    neighborhoodEnteredDirectlyRef.current = false
    if (returnViewport) setCamera(returnViewport)
  }, [dispatch, setCamera])

  const handleClearNeighborhood = useCallback(() => {
    const enteredDirectly = neighborhoodEnteredDirectlyRef.current
    setSchools([])
    setClusters([])
    setNeighborhoodScope(null)
    setNeighborhoodSchoolIds([])
    if (enteredDirectly) setDistrictScope(null)
    dispatch({ type: 'SET_SELECTED_SCHOOL', payload: null })
    const returnViewport = neighborhoodReturnViewportRef.current
    neighborhoodReturnViewportRef.current = null
    neighborhoodEnteredDirectlyRef.current = false
    if (returnViewport) setCamera(returnViewport)
  }, [dispatch, setCamera])

  useEffect(() => {
    const previousSchool = previousSelectedSchoolRef.current
    if (previousSchool && !state.selectedSchool && schoolReturnViewportRef.current) {
      setCamera(schoolReturnViewportRef.current)
      schoolReturnViewportRef.current = null
    }
    previousSelectedSchoolRef.current = state.selectedSchool
  }, [setCamera, state.selectedSchool])

  useEffect(() => {
    if (state.map.zoom <= 12) {
      setDistrictScope(null)
      setNeighborhoodScope(null)
      setNeighborhoodSchoolIds([])
      neighborhoodEnteredDirectlyRef.current = false
    } else if (state.map.zoom < 14) {
      setNeighborhoodScope(null)
      setNeighborhoodSchoolIds([])
      if (neighborhoodEnteredDirectlyRef.current) {
        setDistrictScope(null)
        neighborhoodEnteredDirectlyRef.current = false
      }
    }
  }, [state.map.zoom])

  // 데이터 로드
  useEffect(() => {
    let cancelled = false
    let requestTimer: ReturnType<typeof setTimeout> | undefined

    const loadSchoolData = async () => {
      if (!map || !state.map.bounds || !shouldShowMarkers) {
        setSchools([])
        setClusters([])
        return
      }

      setLoading(true)
      setError(null)

      try {
        const data = state.map.zoom < 14 && !districtScope
          ? await fetchDistrictOverviewData(state.filters)
          : state.map.zoom >= 14 && neighborhoodSchoolIds.length > 0
          ? await fetchSchoolsByIds(neighborhoodSchoolIds, state.filters)
          : districtScope && state.map.zoom >= 13
          ? await fetchSchoolsByAdministrativeArea(
            districtScope.region,
            districtScope.district,
            state.map.zoom >= 14 ? neighborhoodScope : null,
            state.filters,
          )
          : await fetchRegionData(
            state.map.bounds,
            state.map.zoom,
            state.filters,
          )

        // 개별 학교 데이터인 경우에만 처리 (id 또는 school_id 필드 확인)
        if (Array.isArray(data) && data.length > 0 && ('id' in data[0] || 'school_id' in data[0])) {
          const schoolData = data as School[]
          const scopedSchoolData = state.map.zoom >= 14 && neighborhoodSchoolIds.length > 0
            ? schoolData
            : state.map.zoom >= 14 && neighborhoodScope
              ? schoolData.filter((school) => school.district === districtScope?.district && getSchoolNeighborhoodLabel(school) === neighborhoodScope)
            : state.map.zoom >= 13 && districtScope
              ? schoolData.filter((school) => school.district === districtScope.district)
              : schoolData
          if (cancelled) return
          setSchools(scopedSchoolData)

          // Keep one predictable hierarchy per zoom: district, neighborhood, school.
          if (state.map.zoom <= 12) {
            const districtClusters = groupSchoolsByDistrict(scopedSchoolData, state.filters.target_grade)
            setClusters(districtClusters.filter((cluster) => clusterIntersectsBounds(cluster, state.map.bounds!)))
          } else if (state.map.zoom < 14) {
            const neighborhoodClusters = groupSchoolsByNeighborhood(scopedSchoolData, state.filters.target_grade)
            setClusters(neighborhoodClusters.filter((cluster) => clusterIntersectsBounds(cluster, state.map.bounds!)))
          } else {
            setClusters([])
          }
        } else if (!cancelled) {
          setSchools([])
          setClusters([])
        }
      } catch (err) {
        if (cancelled) return
        console.error('학교 데이터 로드 실패:', err)
        setError(err instanceof Error ? err.message : '데이터 로드 실패')
        setSchools([])
        setClusters([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    requestTimer = setTimeout(loadSchoolData, 180)
    return () => {
      cancelled = true
      if (requestTimer) clearTimeout(requestTimer)
    }
  }, [districtScope, map, neighborhoodSchoolIds, neighborhoodScope, state.map.bounds, state.map.zoom, state.filters, shouldShowMarkers, displayMode])

  // 마커 렌더링
  if (!map || !shouldShowMarkers) return null

  return (
    <>
      {loading && (
        <div className="absolute top-4 left-4 bg-white rounded shadow p-2 z-10" role="status">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
            <span className="text-sm text-gray-600">마커 갱신 중</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-4 bg-red-50 border border-red-200 rounded p-3 z-10 max-w-xs" role="alert">
          <span className="text-sm text-red-800">{error}</span>
        </div>
      )}

      {clusters.length > 0 && (
        <div className="map-legend pointer-events-none absolute left-3 flex items-center gap-3 rounded-md border border-gray-200 bg-white/95 px-3 py-2 text-[11px] font-medium text-gray-700 shadow-sm" aria-label="학교 규모 색상 안내">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" aria-hidden="true" />{state.filters.target_grade}학년 80명부터</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />{state.filters.target_grade}학년 79명까지</span>
        </div>
      )}

      {clusters.length > 0 && clusters.map((cluster, index) => (
        cluster.schools.length === 1 && !cluster.label
      ) ? (
        <SchoolMarker
          key={cluster.schools[0].school_id}
          school={cluster.schools[0]}
          map={map}
          targetGrade={state.filters.target_grade}
          selected={state.selectedSchool?.school_id === cluster.schools[0].school_id}
          dimmed={Boolean(state.selectedSchool && state.selectedSchool.school_id !== cluster.schools[0].school_id)}
          onClick={handleSchoolClick}
        />
      ) : (
        <ClusterMarker
          key={`cluster-${cluster.schools[0].school_id}-${index}`}
          cluster={cluster}
          map={map}
          targetGrade={state.filters.target_grade}
          onClick={handleClusterClick}
        />
      ))}

      {state.map.zoom >= 14 && clusters.length === 0 && schools.map((school) => (
        <SchoolMarker
          key={school.school_id}
          school={school}
          map={map}
          targetGrade={state.filters.target_grade}
          selected={state.selectedSchool?.school_id === school.school_id}
          dimmed={Boolean(state.selectedSchool && state.selectedSchool.school_id !== school.school_id)}
          onClick={handleSchoolClick}
        />
      ))}

      {districtScope && !neighborhoodScope && (
        <DistrictNeighborhoodSheet
          region={districtScope.region}
          district={districtScope.district}
          schools={schools}
          targetGrade={state.filters.target_grade}
          loading={loading}
          isOpen={!state.selectedSchool}
          onNeighborhoodSelect={handleClusterClick}
          onClear={handleClearDistrict}
        />
      )}

      {districtScope && neighborhoodScope && (
        <NeighborhoodSchoolSheet
          district={districtScope.district}
          neighborhood={neighborhoodScope}
          schools={schools}
          targetGrade={state.filters.target_grade}
          isOpen={!state.selectedSchool}
          onSchoolSelect={handleSchoolClick}
          onClear={handleClearNeighborhood}
        />
      )}

    </>
  )
}

export default MarkerManager
