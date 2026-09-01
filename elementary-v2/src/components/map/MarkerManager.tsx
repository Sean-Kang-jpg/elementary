/**
 * 마커 관리 컴포넌트
 * 줌 레벨에 따라 개별 마커 또는 클러스터 마커를 표시
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useAppContext } from '../../contexts/AppContext'
import { fetchDistrictOverviewData, fetchRegionData, fetchSchoolsByAdministrativeArea, fetchSchoolsByIds } from '../../services/dataService'
import { ClusterPoint, getSchoolNeighborhoodLabel, groupSchoolsByDistrict, groupSchoolsByNeighborhood } from '../../utils/clusterUtils'
import { getDisplayMode } from '../../utils/mapUtils'
import { MapBounds, School } from '../../types'
import SchoolMarker from './SchoolMarker'
import ClusterMarker from './ClusterMarker'

interface MarkerManagerProps {
  map: NaverMap | null
}

interface DistrictScope {
  region: string
  district: string
}

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

  // 현재 표시 모드
  const displayMode = getDisplayMode(state.map.zoom)
  const shouldShowMarkers = displayMode === 'SCHOOLS' && state.map.zoom >= 11 // 줌 11부터 마커 표시

  // 학교 클릭 핸들러
  const handleSchoolClick = useCallback((school: School) => {
    dispatch({
      type: 'SET_SELECTED_SCHOOL',
      payload: school
    })
  }, [dispatch])

  // Move exactly one level down: district -> neighborhood -> school.
  const handleClusterClick = useCallback((cluster: ClusterPoint) => {
    const isDistrictLevel = state.map.zoom <= 12
    const nextZoom = isDistrictLevel ? 13 : 15
    if (isDistrictLevel) {
      const firstSchool = cluster.schools[0]
      setDistrictScope({
        region: firstSchool.region,
        district: cluster.label || firstSchool.district || '',
      })
      setNeighborhoodScope(null)
      setNeighborhoodSchoolIds([])
    } else {
      setNeighborhoodScope(cluster.label || getSchoolNeighborhoodLabel(cluster.schools[0]))
      setNeighborhoodSchoolIds(cluster.schools.map((school) => school.school_id))
    }
    dispatch({ type: 'SET_SELECTED_SCHOOL', payload: null })
    dispatch({
      type: 'SET_MAP_STATE',
      payload: { zoom: nextZoom, center: cluster.center },
    })
  }, [dispatch, state.map.zoom])

  useEffect(() => {
    if (state.map.zoom <= 12) {
      setDistrictScope(null)
      setNeighborhoodScope(null)
      setNeighborhoodSchoolIds([])
    } else if (state.map.zoom < 15) {
      setNeighborhoodScope(null)
      setNeighborhoodSchoolIds([])
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
        const data = state.map.zoom < 15 && !districtScope
          ? await fetchDistrictOverviewData(state.filters)
          : state.map.zoom >= 15 && neighborhoodSchoolIds.length > 0
          ? await fetchSchoolsByIds(neighborhoodSchoolIds, state.filters)
          : districtScope && state.map.zoom >= 13
          ? await fetchSchoolsByAdministrativeArea(
            districtScope.region,
            districtScope.district,
            state.map.zoom >= 15 ? neighborhoodScope : null,
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
          const scopedSchoolData = state.map.zoom >= 15 && neighborhoodSchoolIds.length > 0
            ? schoolData
            : state.map.zoom >= 15 && neighborhoodScope
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
          } else if (state.map.zoom < 15) {
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
        <div className="pointer-events-none absolute bottom-4 left-3 z-10 flex items-center gap-3 rounded-md border border-gray-200 bg-white/95 px-3 py-2 text-[11px] font-medium text-gray-700 shadow-sm" aria-label="학교 규모 색상 안내">
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

      {state.map.zoom >= 15 && clusters.length === 0 && schools.map((school) => (
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

    </>
  )
}

export default MarkerManager
