import { ChevronRight, GraduationCap, LayoutGrid, Users } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { School } from '../../types'
import BottomSheet from '../ui/BottomSheet'

interface NeighborhoodSchoolSheetProps {
  district: string
  neighborhood: string
  schools: School[]
  targetGrade: number
  isOpen: boolean
  onSchoolSelect: (school: School) => void
  onClear: () => void
}

const getGradeValue = (school: School, grade: number, metric: 'students' | 'classes') => (
  Number(school[`grade${grade}_${metric}` as keyof School]) || 0
)

export default function NeighborhoodSchoolSheet({
  district,
  neighborhood,
  schools,
  targetGrade,
  isOpen,
  onSchoolSelect,
  onClear,
}: NeighborhoodSchoolSheetProps) {
  const [collapsed, setCollapsed] = useState(false)
  const sortedSchools = useMemo(
    () => [...schools].sort((a, b) => (
      getGradeValue(b, targetGrade, 'students') - getGradeValue(a, targetGrade, 'students')
      || a.school_name.localeCompare(b.school_name, 'ko')
    )),
    [schools, targetGrade],
  )
  const handleSnapChange = useCallback((snapIndex: number) => {
    setCollapsed(snapIndex === 0)
  }, [])

  const title = (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1 text-base font-semibold text-gray-950">
        <span className="truncate text-gray-500">{district}</span>
        <ChevronRight className="flex-none text-gray-400" size={16} aria-hidden="true" />
        <span className="truncate">{neighborhood}</span>
      </div>
      <span className="mt-0.5 block text-xs font-medium text-gray-500">
        {sortedSchools.length}개 초등학교
      </span>
    </div>
  )

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClear}
      title={title}
      snapPoints={[0.09, 0.28, 0.52]}
      defaultSnap={1}
      swipeDownBehavior="collapse"
      onSnapChange={handleSnapChange}
      closeLabel={`${neighborhood} 선택 해제`}
      className="z-[51]"
    >
      <div className={collapsed ? 'hidden' : 'mx-auto h-full w-full max-w-3xl overflow-auto px-3 pb-4 pt-2'}>
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          {sortedSchools.map((school) => {
            const students = getGradeValue(school, targetGrade, 'students')
            const classes = getGradeValue(school, targetGrade, 'classes')
            return (
              <button
                key={school.school_id}
                type="button"
                onClick={() => onSchoolSelect(school)}
                className="flex min-h-14 w-full items-center gap-2.5 border-b border-gray-100 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-gray-50 focus-visible:bg-blue-50"
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-blue-50 text-blue-700" aria-hidden="true">
                  <GraduationCap size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-semibold text-gray-950">{school.school_name}</strong>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><Users size={13} aria-hidden="true" />{targetGrade}학년 {students.toLocaleString('ko-KR')}명</span>
                    <span className="inline-flex items-center gap-1"><LayoutGrid size={13} aria-hidden="true" />{classes}학급</span>
                  </span>
                </span>
                <ChevronRight className="flex-none text-gray-400" size={18} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
