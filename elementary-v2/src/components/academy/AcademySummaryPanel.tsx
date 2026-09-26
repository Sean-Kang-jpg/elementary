import { GraduationCap, Map } from 'lucide-react'
import { useMemo } from 'react'
import type { AcademyAddress } from '../../types'

interface AcademySummaryPanelProps {
  academies: AcademyAddress[]
  loading?: boolean
  error?: string | null
  onShowMap?: () => void
}

const addCounts = (rows: AcademyAddress[], field: 'realm_counts' | 'institution_type_counts') => rows.reduce<Record<string, number>>((totals, row) => {
  Object.entries(row[field] || {}).forEach(([name, count]) => {
    totals[name] = (totals[name] || 0) + Number(count || 0)
  })
  return totals
}, {})

export default function AcademySummaryPanel({ academies, loading = false, error = null, onShowMap }: AcademySummaryPanelProps) {
  const summary = useMemo(() => {
    const core = academies.filter((row) => row.distance_band === 'core')
    const extended = academies.filter((row) => row.distance_band === 'extended')
    const institutionCount = (rows: AcademyAddress[]) => rows.reduce((sum, row) => sum + row.institution_count, 0)
    const categories = Object.entries(addCounts(academies, 'realm_counts'))
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
    return {
      total: institutionCount(academies),
      core: institutionCount(core),
      extended: institutionCount(extended),
      categories,
    }
  }, [academies])

  if (loading) return <div className="py-10 text-center text-sm text-gray-500">주변 교육환경을 불러오는 중입니다.</div>
  if (error) return <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>
  if (!academies.length) return <div className="py-10 text-center text-sm text-gray-500">현재 확인된 주변 학원·교습소가 없습니다.</div>

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
          <h3 id="academy-category-title" className="mb-2 font-semibold text-gray-950">분야별 구성</h3>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200">
            {summary.categories.map(([name, count]) => <div key={name} className="bg-white p-3"><span className="block truncate text-xs text-gray-500">{name}</span><strong className="mt-1 block text-lg text-gray-950">{count.toLocaleString()}</strong></div>)}
          </div>
        </section>
      ) : null}

      {onShowMap ? <button type="button" onClick={onShowMap} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"><Map size={18} aria-hidden="true" />지도에서 보기</button> : null}
      <p className="text-[11px] leading-4 text-gray-500">배정 아파트 주변의 직선거리 기반 집계이며 학교 또는 아파트의 공식 학원 배정 정보를 의미하지 않습니다.</p>
    </div>
  )
}
