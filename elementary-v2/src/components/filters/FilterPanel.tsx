import {
  Building2,
  Check,
  GraduationCap,
  Landmark,
  RotateCcw,
  School as SchoolIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { DEFAULT_FILTERS, useFilters, useUI } from '../../contexts/AppContext'
import { clearDataCache, getFilteredSchoolCount } from '../../services/dataService'
import type { FilterState } from '../../types'
import { UNLIMITED_APARTMENT_AGE } from '../../types'

const SCHOOL_TYPES = [
  { value: 'public', label: '공립', icon: SchoolIcon },
  { value: 'private', label: '사립', icon: GraduationCap },
  { value: 'national', label: '국립', icon: Landmark },
] as const

const AGE_OPTIONS = [
  { value: UNLIMITED_APARTMENT_AGE, label: '전체' },
  { value: 10, label: '10년 이내' },
  { value: 20, label: '20년 이내' },
  { value: 30, label: '30년 이내' },
  { value: 40, label: '40년 이내' },
]

const PARKING_OPTIONS = [0, 0.8, 1, 1.2, 1.5]

interface RangeFieldProps {
  label: string
  valueLabel: string
  min: number
  max: number
  step: number
  value: number
  minLabel: string
  maxLabel: string
  onChange: (value: number) => void
}

function RangeField({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  minLabel,
  maxLabel,
  onChange,
}: RangeFieldProps) {
  const progress = ((value - min) / (max - min)) * 100

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <label className="text-sm font-semibold text-gray-900">{label}</label>
        <strong className="text-sm text-blue-700">{valueLabel}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="filter-range w-full"
        style={{ '--range-progress': `${progress}%` } as CSSProperties}
      />
      <div className="mt-1 flex justify-between text-xs text-gray-500">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  )
}

const activeFilterCount = (filters: FilterState) => [
  filters.target_grade !== DEFAULT_FILTERS.target_grade,
  filters.min_students !== DEFAULT_FILTERS.min_students,
  filters.school_types.length !== DEFAULT_FILTERS.school_types.length,
  filters.min_households > 0,
  filters.min_parking_ratio > 0,
  filters.max_apartment_age < UNLIMITED_APARTMENT_AGE,
  filters.max_public_rental_ratio < 100,
].filter(Boolean).length

export default function FilterPanel() {
  const { filters, setFilter } = useFilters()
  const { ui, toggleSidebar } = useUI()
  const [draft, setDraft] = useState<FilterState>(filters)
  const [resultCount, setResultCount] = useState<number | null>(null)
  const [countLoading, setCountLoading] = useState(false)

  useEffect(() => {
    if (ui.sidebar_open) setDraft(filters)
  }, [filters, ui.sidebar_open])

  useEffect(() => {
    if (!ui.sidebar_open) return
    let active = true
    setCountLoading(true)
    const timer = window.setTimeout(() => {
      getFilteredSchoolCount(draft)
        .then((count) => {
          if (active) setResultCount(count)
        })
        .finally(() => {
          if (active) setCountLoading(false)
        })
    }, 350)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [draft, ui.sidebar_open])

  const appliedCount = useMemo(() => activeFilterCount(draft), [draft])
  const updateDraft = (next: Partial<FilterState>) => setDraft((current) => ({ ...current, ...next }))
  const resetDraft = () => setDraft({
    ...DEFAULT_FILTERS,
    selected_cities: filters.selected_cities,
    selected_districts: filters.selected_districts,
  })

  const toggleSchoolType = (schoolType: FilterState['school_types'][number]) => {
    const selected = draft.school_types.includes(schoolType)
    updateDraft({
      school_types: selected
        ? draft.school_types.filter((type) => type !== schoolType)
        : [...draft.school_types, schoolType],
    })
  }

  const applyFilters = () => {
    clearDataCache()
    setFilter(draft)
    toggleSidebar()
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <span className="text-xs font-medium text-gray-500">
          학교와 배정 아파트 조건을 함께 적용합니다
        </span>
        <button
          type="button"
          onClick={resetDraft}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          <RotateCcw size={15} aria-hidden="true" />
          초기화
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28">
        <section className="border-b border-gray-200 py-5" aria-labelledby="school-filter-title">
          <div className="mb-5 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-700">
              <GraduationCap size={18} aria-hidden="true" />
            </span>
            <div>
              <h3 id="school-filter-title" className="text-base font-semibold text-gray-950">학교 조건</h3>
              <p className="text-xs text-gray-500">선택한 학년의 학생 규모를 비교합니다</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <span className="mb-2 block text-sm font-semibold text-gray-900">기준 학년</span>
              <div className="grid grid-cols-6 overflow-hidden rounded-md border border-gray-200" role="group" aria-label="기준 학년">
                {[1, 2, 3, 4, 5, 6].map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    onClick={() => updateDraft({ target_grade: grade })}
                    aria-pressed={draft.target_grade === grade}
                    className={`h-10 border-r border-gray-200 text-sm font-semibold last:border-r-0 ${draft.target_grade === grade ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>

            <RangeField
              label="최소 학생 수"
              valueLabel={`${draft.min_students}명 이상`}
              min={0}
              max={200}
              step={10}
              value={draft.min_students}
              minLabel="제한 없음"
              maxLabel="200명+"
              onChange={(value) => updateDraft({ min_students: value })}
            />

            <div>
              <span className="mb-2 block text-sm font-semibold text-gray-900">설립 유형</span>
              <div className="grid grid-cols-3 gap-2">
                {SCHOOL_TYPES.map(({ value, label, icon: Icon }) => {
                  const selected = draft.school_types.includes(value)
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleSchoolType(value)}
                      aria-pressed={selected}
                      className={`relative flex h-16 flex-col items-center justify-center gap-1 rounded-md border text-sm font-medium ${selected ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {selected && <Check className="absolute right-1.5 top-1.5" size={13} aria-hidden="true" />}
                      <Icon size={19} aria-hidden="true" />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="py-5" aria-labelledby="apartment-filter-title">
          <div className="mb-5 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
              <Building2 size={18} aria-hidden="true" />
            </span>
            <div>
              <h3 id="apartment-filter-title" className="text-base font-semibold text-gray-950">배정 아파트 조건</h3>
              <p className="text-xs text-gray-500">조건을 만족하는 단지가 하나 이상인 학교만 표시합니다</p>
            </div>
          </div>

          <div className="space-y-7">
            <RangeField
              label="최소 세대 수"
              valueLabel={draft.min_households ? `${draft.min_households.toLocaleString()}세대 이상` : '제한 없음'}
              min={0}
              max={2000}
              step={100}
              value={draft.min_households}
              minLabel="제한 없음"
              maxLabel="2,000세대+"
              onChange={(value) => updateDraft({ min_households: value })}
            />

            <div>
              <span className="mb-2 block text-sm font-semibold text-gray-900">세대당 주차 대수</span>
              <div className="flex flex-wrap gap-2">
                {PARKING_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateDraft({ min_parking_ratio: value })}
                    aria-pressed={draft.min_parking_ratio === value}
                    className={`h-9 rounded-md border px-3 text-sm font-medium ${draft.min_parking_ratio === value ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {value === 0 ? '전체' : `${value}대+`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-2 block text-sm font-semibold text-gray-900">사용 승인 연식</span>
              <div className="grid grid-cols-2 gap-2">
                {AGE_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateDraft({ max_apartment_age: value })}
                    aria-pressed={draft.max_apartment_age === value}
                    className={`h-10 rounded-md border px-3 text-sm font-medium ${draft.max_apartment_age === value ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <RangeField
              label="공공임대 비율 상한"
              valueLabel={draft.max_public_rental_ratio === 100 ? '제한 없음' : `${draft.max_public_rental_ratio}% 이하`}
              min={0}
              max={100}
              step={5}
              value={draft.max_public_rental_ratio}
              minLabel="0%"
              maxLabel="제한 없음"
              onChange={(value) => updateDraft({ max_public_rental_ratio: value })}
            />
          </div>
        </section>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <button
          type="button"
          onClick={applyFilters}
          disabled={draft.school_types.length === 0}
          className="flex h-12 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {draft.school_types.length === 0
            ? '학교 유형을 하나 이상 선택하세요'
            : countLoading
              ? '결과 확인 중...'
              : resultCount == null
                ? `필터 ${appliedCount ? `${appliedCount}개 ` : ''}적용`
                : `조건에 맞는 학교 ${resultCount.toLocaleString()}개 보기`}
        </button>
      </div>
    </div>
  )
}
