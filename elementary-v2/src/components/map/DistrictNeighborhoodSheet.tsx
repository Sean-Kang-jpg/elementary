import { ChevronRight, MapPinned, School as SchoolIcon, Users } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { School } from '../../types'
import { ClusterPoint, groupSchoolsByNeighborhood } from '../../utils/clusterUtils'
import BottomSheet from '../ui/BottomSheet'

interface DistrictNeighborhoodSheetProps {
  region: string
  district: string
  schools: School[]
  targetGrade: number
  loading: boolean
  isOpen: boolean
  onNeighborhoodSelect: (cluster: ClusterPoint) => void
  onClear: () => void
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
}: DistrictNeighborhoodSheetProps) {
  const [collapsed, setCollapsed] = useState(false)
  const neighborhoods = useMemo(
    () => groupSchoolsByNeighborhood(schools, targetGrade)
      .sort((a, b) => (
        b.schools.length - a.schools.length
        || (a.label || '').localeCompare(b.label || '', 'ko')
      )),
    [schools, targetGrade],
  )
  const handleSnapChange = useCallback((snapIndex: number) => {
    setCollapsed(snapIndex === 0)
  }, [])

  const title = (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1 text-base font-semibold text-gray-950">
        <span className="truncate text-gray-500">{region}</span>
        <ChevronRight className="flex-none text-gray-400" size={16} aria-hidden="true" />
        <span className="truncate">{district}</span>
      </div>
      <span className="mt-0.5 block text-xs font-medium text-gray-500">
        {neighborhoods.length}개 동 · {schools.length}개 초등학교
      </span>
    </div>
  )

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClear}
      title={title}
      snapPoints={[0.09, 0.32, 0.56]}
      defaultSnap={1}
      swipeDownBehavior="collapse"
      onSnapChange={handleSnapChange}
      closeLabel={`${district} 선택 해제`}
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
                key={`${district}-${cluster.label}`}
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
                    <span className="inline-flex items-center gap-1">
                      <SchoolIcon size={13} aria-hidden="true" />
                      <span className="font-semibold text-blue-700">80명부터 {cluster.high_count || 0}</span>
                      <span className="font-semibold text-amber-700">79명까지 {cluster.low_count || 0}</span>
                    </span>
                  </span>
                </span>
                <ChevronRight className="flex-none text-gray-400" size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
