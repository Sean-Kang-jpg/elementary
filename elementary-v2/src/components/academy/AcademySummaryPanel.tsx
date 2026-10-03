import { BookOpen, Calculator, Code, Dumbbell, FlaskConical, Globe, GraduationCap, Languages, Map, Palette, PenLine, Shapes } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AcademyAddress } from '../../types'
import { ACADEMY_CATEGORIES, getAcademyCategoryCounts, type AcademyCategoryKey } from '../../utils/academyCategories'

interface AcademySummaryPanelProps {
  academies: AcademyAddress[]
  loading?: boolean
  error?: string | null
  onShowMap?: () => void
  dataAvailable?: boolean
}

const CATEGORY_ICONS = {
  english: Languages,
  math: Calculator,
  writing: PenLine,
  science: FlaskConical,
  coding: Code,
  study: BookOpen,
  language: Globe,
  arts: Palette,
  sports: Dumbbell,
  other: Shapes,
} as const

export default function AcademySummaryPanel({ academies, loading = false, error = null, onShowMap, dataAvailable = true }: AcademySummaryPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<AcademyCategoryKey | null>(null)
  const summary = useMemo(() => {
    const core = academies.filter((row) => row.distance_band === 'core')
    const extended = academies.filter((row) => row.distance_band === 'extended')
    const institutionCount = (rows: AcademyAddress[]) => rows.reduce((sum, row) => sum + row.institution_count, 0)
    const categoryTotals = Object.fromEntries(ACADEMY_CATEGORIES.map(({ key }) => [key, 0])) as Record<AcademyCategoryKey, number>
    academies.forEach((academy) => {
      const counts = getAcademyCategoryCounts(academy)
      ACADEMY_CATEGORIES.forEach(({ key }) => { categoryTotals[key] += counts[key] })
    })
    const categories = ACADEMY_CATEGORIES
      .map((category) => ({ ...category, count: categoryTotals[category.key] }))
      .filter(({ count }) => count > 0)
      .sort((a, b) => b.count - a.count)
    return {
      total: institutionCount(academies),
      core: institutionCount(core),
      extended: institutionCount(extended),
      categories,
      largestCategory: Math.max(...categories.map(({ count }) => count), 1),
    }
  }, [academies])

  const selectCategory = (category: AcademyCategoryKey) => {
    const nextCategory = selectedCategory === category ? null : category
    setSelectedCategory(nextCategory)
    window.dispatchEvent(new CustomEvent('joinmap:filter-academies', { detail: { category: nextCategory } }))
    onShowMap?.()
  }

  if (!dataAvailable) return <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-medium text-gray-600">교육시설 데이터 준비 중</div>
  if (loading) return <div className="py-10 text-center text-sm text-gray-500">주변 교육환경을 불러오는 중입니다.</div>
  if (error) return <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>
  if (!academies.length) return <div className="py-10 text-center text-sm text-gray-500">현재 확인된 주변 학원·교습소·체육도장이 없습니다.</div>

  return (
    <div className="space-y-4">
      <section className="flex items-center gap-3 border-b border-gray-200 pb-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-teal-50 text-teal-800"><GraduationCap size={24} aria-hidden="true" /></span>
        <span><span className="block text-sm text-gray-500">주변 교육시설</span><strong className="text-2xl text-gray-950">{summary.total.toLocaleString()}곳</strong></span>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-teal-50 p-3"><span className="text-xs text-teal-700">핵심 생활권 · 600m</span><strong className="mt-1 block text-xl text-teal-900">{summary.core.toLocaleString()}</strong></div>
        <div className="rounded-md bg-gray-100 p-3"><span className="text-xs text-gray-600">확장 생활권 · 800m</span><strong className="mt-1 block text-xl text-gray-900">{summary.extended.toLocaleString()}</strong></div>
      </div>

      {summary.categories.length ? (
        <section aria-labelledby="academy-category-title">
          <h3 id="academy-category-title" className="mb-2 font-semibold text-gray-950">분야별 분포 <span className="text-xs font-normal text-gray-500">· 선택하여 지도 강조</span></h3>
          <p className="mb-2 text-[11px] leading-4 text-gray-500">분야는 학원 이름으로 나눴어요. 영어·수학을 함께 가르치는 곳은 두 분야에 모두 셉니다.</p>
          <div className="space-y-1">
            {summary.categories.map(({ key, label, count, color, softColor }) => {
              const Icon = CATEGORY_ICONS[key]
              const selected = selectedCategory === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectCategory(key)}
                  aria-pressed={selected}
                  className={`grid w-full grid-cols-[36px_1fr_auto] items-center gap-3 rounded-md border px-2.5 py-2 text-left transition-colors ${selected ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'}`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md" style={{ color, backgroundColor: softColor }}><Icon size={17} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-800">{label}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full" style={{ width: `${Math.max(6, (count / summary.largestCategory) * 100)}%`, backgroundColor: color }} /></span>
                  </span>
                  <strong className="text-sm text-gray-700">{count.toLocaleString()}</strong>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {onShowMap ? <button type="button" onClick={onShowMap} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"><Map size={18} aria-hidden="true" />교육시설 지도 보기</button> : null}
      <p className="text-[11px] leading-4 text-gray-500">배정 아파트 주변 학원·교습소·체육도장의 직선거리 기반 집계이며 공식 배정 관계를 의미하지 않습니다.</p>
    </div>
  )
}
