import { ChevronRight, MapPinned, Users } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { School } from '../../types'
import { ClusterPoint, groupSchoolsByDistrict, groupSchoolsByNeighborhood } from '../../utils/clusterUtils'
import BottomSheet from '../ui/BottomSheet'
import { areaPath } from '../../utils/urlState'
import { followLink } from '../content/contentLinks'

interface DistrictNeighborhoodSheetProps {
  region: string
  // 없으면 시·도 시트다: 시·군·구를 나열한다. 있으면 구 시트로 동을 나열한다.
  district?: string
  schools: School[]
  targetGrade: number
  loading: boolean
  isOpen: boolean
  onNeighborhoodSelect: (cluster: ClusterPoint) => void
  onClear: () => void
  onNavigate?: (path: string) => void
}

export default function DistrictNeighborhoodSheet({
  region,
  district,
  schools,
  targetGrade,
  loading,
  isOpen,
  onNeighborhoodSelect,
  onClear,
  onNavigate,
}: DistrictNeighborhoodSheetProps) {
  const [collapsed, setCollapsed] = useState(false)
  const isRegionLevel = !district
  const areaName = district || region
  // 이 구역의 지역 허브(/area/서울, /area/서울/강남구). 학교 상세의 허브 링크와 같은 규칙이다.
  const hub = areaPath({ region, district: district || '' })
  const hubLabel = region === '세종특별자치시' || !district ? region : district
  const neighborhoods = useMemo(
    () => (isRegionLevel ? groupSchoolsByDistrict : groupSchoolsByNeighborhood)(schools, targetGrade)
      .sort((a, b) => (
        b.total_students - a.total_students
        || b.schools.length - a.schools.length
        || (a.label || '').localeCompare(b.label || '', 'ko')
      )),
    [isRegionLevel, schools, targetGrade],
  )
  const handleSnapChange = useCallback((snapIndex: number) => {
    setCollapsed(snapIndex === 0)
  }, [])

  const title = (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1 text-base font-semibold text-gray-950">
        {district ? (
          <>
            <span className="truncate text-gray-500">{region}</span>
            <ChevronRight className="flex-none text-gray-400" size={16} aria-hidden="true" />
            <span className="truncate">{district}</span>
          </>
        ) : (
          <span className="truncate">{region}</span>
        )}
      </div>
      <span className="mt-0.5 flex items-center gap-2 text-xs font-medium text-gray-500">
        <span>{neighborhoods.length}개 {isRegionLevel ? '시·군·구' : '동'} · {schools.length}개 초등학교</span>
        <span className="inline-flex items-center gap-1" aria-label="파랑은 80명 이상 학교, 주황은 80명 미만 학교">
          <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />80+
          <span className="ml-1 h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />80 미만
        </span>
      </span>
    </div>
  )

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClear}
      historyKey={isRegionLevel ? 'region' : 'district'}
      title={title}
      snapPoints={[0.09, 0.36, 0.88]}
      defaultSnap={1}
      swipeDownBehavior="collapse"
      onSnapChange={handleSnapChange}
      closeLabel={`${areaName} 선택 해제`}
      className="z-[51]"
    >
      <div className={collapsed ? 'hidden' : 'mx-auto h-full w-full max-w-3xl overflow-auto px-3 pb-4 pt-2'}>
        {loading && neighborhoods.length === 0 ? (
          <div className="flex min-h-20 items-center justify-center text-sm text-gray-500" role="status">
            하위 행정구역을 불러오는 중
          </div>
        ) : neighborhoods.length === 0 ? (
          <div className="flex min-h-20 items-center justify-center text-sm text-gray-500">
            표시할 하위 행정구역이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
            {neighborhoods.map((cluster) => (
              <button
                key={`${areaName}-${cluster.label}`}
                type="button"
                onClick={() => onNeighborhoodSelect(cluster)}
                className="flex min-h-[62px] w-full items-center gap-2.5 border-b border-gray-100 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-gray-50 focus-visible:bg-blue-50"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-sky-50 text-sky-700" aria-hidden="true">
                  <MapPinned size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <strong className="truncate text-sm font-semibold text-gray-950">{cluster.label}</strong>
                    <span className="flex-none text-xs font-medium text-gray-500">{cluster.schools.length}개교</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Users size={13} aria-hidden="true" />
                      {targetGrade}학년 {cluster.total_students.toLocaleString('ko-KR')}명
                    </span>
                    <span className="inline-flex items-center gap-1.5" aria-label={`80명 이상 학교 ${cluster.high_count || 0}개, 80명 미만 학교 ${cluster.low_count || 0}개`}>
                      <span className="district-count-circle district-count-circle--high" aria-hidden="true">{cluster.high_count || 0}</span>
                      <span className="district-count-circle district-count-circle--low" aria-hidden="true">{cluster.low_count || 0}</span>
                    </span>
                  </span>
                </span>
                <ChevronRight className="flex-none text-gray-400" size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <a
          href={hub}
          onClick={(event) => { if (onNavigate) followLink(event, hub, onNavigate) }}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
          data-testid="area-hub-link"
        >
          {hubLabel} 초등학교 전체 비교
          <ChevronRight size={16} aria-hidden="true" />
        </a>
      </div>
    </BottomSheet>
  )
}
