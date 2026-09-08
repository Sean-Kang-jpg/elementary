import { BarChart3, Filter, LoaderCircle, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchReportScatterRows, type ReportScatterRow } from '../../services/dataService'

type XMetric = 'households' | 'builtYear' | 'parkingRatio'
type FilterOption = 'all' | 'before2000' | '2000s' | '2010s' | '2020s'
type SchoolPlotRow = ReportScatterRow & {
  complexCount: number
  concentration: number | null
  studentYield: number | null
  housingHomogeneity: number | null
}

const REGION_OPTIONS = ['전체', '서울특별시', '경기도', '인천광역시']
const FILTER_OPTIONS: Array<{ value: FilterOption; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'before2000', label: '1999년 이전' },
  { value: '2000s', label: '2000-2009년' },
  { value: '2010s', label: '2010-2019년' },
  { value: '2020s', label: '2020년 이후' },
]
const xMetricLabels: Record<XMetric, string> = {
  households: '배정 단지 세대수',
  builtYear: '사용승인연도',
  parkingRatio: '세대당 주차대수',
}

const toSchoolGroup = (students: number) => students >= 80 ? '80명 이상' : '80명 미만'
const inBuiltYearFilter = (year: number | null, filter: FilterOption) => {
  if (filter === 'all') return true
  if (year === null) return false
  if (filter === 'before2000') return year < 2000
  if (filter === '2000s') return year >= 2000 && year < 2010
  if (filter === '2010s') return year >= 2010 && year < 2020
  return year >= 2020
}
const inParkingFilter = (ratio: number | null, filter: FilterOption) => {
  if (filter === 'all') return true
  if (ratio === null) return false
  if (filter === 'before2000') return ratio < 0.8
  if (filter === '2000s') return ratio >= 0.8 && ratio < 1
  if (filter === '2010s') return ratio >= 1 && ratio < 1.2
  return ratio >= 1.2
}
const formatMetric = (value: number, metric: XMetric) => metric === 'parkingRatio' ? `${value.toFixed(2)}대` : metric === 'builtYear' ? `${value.toFixed(0)}년` : `${Math.round(value).toLocaleString()}세대`
const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function aggregateSchools(rows: ReportScatterRow[]): SchoolPlotRow[] {
  const grouped = new Map<string, ReportScatterRow[]>()
  rows.forEach((row) => {
    const schoolRows = grouped.get(row.schoolId)
    if (schoolRows) schoolRows.push(row)
    else grouped.set(row.schoolId, [row])
  })
  return [...grouped.values()].map((schoolRows) => {
    const first = schoolRows[0]
    const households = schoolRows.map((row) => row.households).filter((value): value is number => value !== null)
    const builtYears = schoolRows.map((row) => row.builtYear).filter((value): value is number => value !== null)
    const parkingRatios = schoolRows.map((row) => row.parkingRatio).filter((value): value is number => value !== null)
    const undergroundRatios = schoolRows
      .filter((row) => row.undergroundParking !== null && row.households !== null && row.households > 0)
      .map((row) => (row.undergroundParking as number) / (row.households as number))
    const totalHouseholds = households.length ? households.reduce((sum, value) => sum + value, 0) : null
    const shares = totalHouseholds ? households.map((value) => value / totalHouseholds) : []
    const concentration = shares.length ? shares.reduce((sum, value) => sum + value ** 2, 0) : null
    const studentYield = totalHouseholds ? first.grade1Students / totalHouseholds * 100 : null
    const coefficient = (values: number[]) => {
      if (values.length < 2) return 0
      const average = values.reduce((sum, value) => sum + value, 0) / values.length
      if (!average) return 0
      const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
      return Math.min(Math.sqrt(variance) / average, 1)
    }
    const dispersionValues = [builtYears.map((year) => 2026 - year), parkingRatios, undergroundRatios]
      .filter((values) => values.length > 0)
      .map(coefficient)
    const homogeneity = dispersionValues.length
      ? 100 - Math.round((dispersionValues.reduce((sum, value) => sum + value, 0) / dispersionValues.length) * 100)
      : null
    return { ...first, complexName: `${schoolRows.length}개 단지`, households: totalHouseholds, builtYear: median(builtYears), parkingRatio: median(parkingRatios), complexCount: schoolRows.length, concentration, studentYield, housingHomogeneity: builtYears.length || parkingRatios.length ? homogeneity : null }
  })
}

function ScatterPlot({ rows, metric, selectedSchoolId, onSelect }: { rows: ReportScatterRow[]; metric: XMetric; selectedSchoolId?: string | null; onSelect?: (school: SchoolPlotRow | null) => void }) {
  const plotRows = aggregateSchools(rows)
  const width = 760
  const height = 330
  const padding = { top: 20, right: 24, bottom: 48, left: 52 }
  const values = plotRows.map((row) => row[metric]).filter((value): value is number => value !== null)
  const maxX = Math.max(...values, metric === 'parkingRatio' ? 1.5 : metric === 'builtYear' ? 2025 : 5000)
  const minX = metric === 'builtYear' ? Math.min(...values, 1980) : 0
  const maxY = Math.max(...plotRows.map((row) => row.grade1Students), 100)
  const meanX = metric === 'households' ? median(values) : values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const schoolValues = plotRows.map((row) => row.grade1Students)
  const meanY = schoolValues.length ? schoolValues.reduce((sum, value) => sum + value, 0) / schoolValues.length : null
  const x = (value: number) => padding.left + ((value - minX) / Math.max(maxX - minX, 1)) * (width - padding.left - padding.right)
  const y = (value: number) => height - padding.bottom - (value / maxY) * (height - padding.top - padding.bottom)
  return <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-2"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px]" role="img" aria-label={`${xMetricLabels[metric]}와 1학년 학생수 산점도`}>
    {[0, 1, 2, 3, 4, 5].map((index) => { const value = (maxY / 5) * index; return <g key={value}><line x1={padding.left} x2={width - padding.right} y1={y(value)} y2={y(value)} stroke="#334155" /><text x={padding.left - 10} y={y(value) + 4} textAnchor="end" fill="#94a3b8" fontSize="11">{Math.round(value)}</text></g> })}
    <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#64748b" />
    {meanX !== null && <><line x1={x(meanX)} x2={x(meanX)} y1={padding.top} y2={height - padding.bottom} stroke="#f8fafc" strokeDasharray="5 5" /><text x={x(meanX) + 5} y={padding.top + 12} fill="#f8fafc" fontSize="10">{metric === 'households' ? '전체 세대수 중앙값' : '전체 X 평균'}</text></>}
    {meanY !== null && <><line x1={padding.left} x2={width - padding.right} y1={y(meanY)} y2={y(meanY)} stroke="#f8fafc" strokeDasharray="5 5" /><text x={width - padding.right - 4} y={y(meanY) - 5} textAnchor="end" fill="#f8fafc" fontSize="10">전체 1학년 평균 {Math.round(meanY)}명</text></>}
    {plotRows.map((row, index) => row[metric] === null ? null : <circle key={`${row.schoolId}-${index}`} cx={x(row[metric] as number)} cy={y(row.grade1Students)} r={selectedSchoolId === row.schoolId ? 7 : 4} fill={row.grade1Students >= 80 ? '#38bdf8' : '#fbbf24'} fillOpacity=".82" stroke={selectedSchoolId === row.schoolId ? '#ffffff' : 'none'} strokeWidth="2" className="cursor-pointer" aria-hidden="true" onClick={() => onSelect?.(row)}><title>{`${row.schoolName} · 배정 ${row.complexCount}개 단지 · ${formatMetric(row[metric] as number, metric)} · 1학년 ${row.grade1Students}명`}</title></circle>)}
    <text x={(padding.left + width - padding.right) / 2} y={height - 12} textAnchor="middle" fill="#cbd5e1" fontSize="12">{xMetricLabels[metric]}</text><text transform={`translate(15 ${(padding.top + height - padding.bottom) / 2}) rotate(-90)`} textAnchor="middle" fill="#cbd5e1" fontSize="12">1학년 학생수</text>
  </svg><IndexSummary rows={plotRows} selectedSchoolId={selectedSchoolId} onClear={() => onSelect?.(null)} /></div>
}

function PivotTable({ rows }: { rows: ReportScatterRow[] }) {
  const schoolRows = aggregateSchools(rows)
  const groups = ['80명 이상', '80명 미만'] as const
  const averageStudents = (subset: ReportScatterRow[]) => {
    const students = [...new Map(subset.map((row) => [row.schoolId, row.grade1Students])).values()]
    return students.length ? `${Math.round(students.reduce((sum, value) => sum + value, 0) / students.length)}명` : '-'
  }
  const medianHouseholds = (subset: ReportScatterRow[]) => {
    const households = subset.map((row) => row.households).filter((value): value is number => value !== null)
    const value = median(households)
    return value === null ? '-' : `${Math.round(value).toLocaleString()}세대`
  }
  return <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-[900px] w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th rowSpan={2} className="px-3 py-2 font-semibold">지역</th><th colSpan={2} className="border-l border-slate-200 px-3 py-2 text-center font-semibold">전체 기준</th>{groups.map((group) => <th key={group} colSpan={3} className="border-l border-slate-200 px-3 py-2 text-center font-semibold">{group}</th>)}</tr><tr><th className="border-l border-slate-200 px-3 py-2">학교별 배정 세대수 중앙값</th><th className="px-3 py-2">전체 1학년 평균</th>{groups.flatMap((group) => [<th key={`${group}-count`} className="border-l border-slate-200 px-3 py-2">학교 수</th>, <th key={`${group}-students`} className="px-3 py-2">1학년 평균</th>, <th key={`${group}-households`} className="px-3 py-2">배정 세대수 중앙값</th>])}</tr></thead><tbody>{REGION_OPTIONS.slice(1).map((region) => { const regionRows = schoolRows.filter((row) => row.region === region); return <tr key={region} className="border-t border-slate-100"><th className="px-3 py-3 font-semibold text-slate-800">{region.replace('특별시', '').replace('광역시', '')}</th><td className="border-l border-slate-100 px-3 py-3 font-semibold text-slate-700">{medianHouseholds(regionRows)}</td><td className="px-3 py-3 font-semibold text-slate-700">{averageStudents(regionRows)}</td>{groups.flatMap((group) => { const subset = regionRows.filter((row) => toSchoolGroup(row.grade1Students) === group); return [<td key={`${region}-${group}-count`} className="border-l border-slate-100 px-3 py-3 text-slate-700">{subset.length}</td>, <td key={`${region}-${group}-students`} className="px-3 py-3 text-slate-700">{averageStudents(subset)}</td>, <td key={`${region}-${group}-households`} className="px-3 py-3 text-slate-700">{medianHouseholds(subset)}</td>] })}</tr> })}</tbody></table></div>
}

function IndexSummary({ rows, selectedSchoolId, onClear }: { rows: SchoolPlotRow[]; selectedSchoolId?: string | null; onClear: () => void }) {
  const average = (values: Array<number | null>) => {
    const valid = values.filter((value): value is number => value !== null)
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
  }
  const indexRows = [
    ['단지 집중도 HHI', average(rows.map((row) => row.concentration)), (value: number) => value.toFixed(3)],
    ['1학년 학생수 / 100세대', average(rows.map((row) => row.studentYield)), (value: number) => `${value.toFixed(1)}명`],
    ['주거 동질성 지수', average(rows.map((row) => row.housingHomogeneity)), (value: number) => `${value.toFixed(0)}점`],
  ] as const
  const selected = rows.find((row) => row.schoolId === selectedSchoolId)
  return <><div className="mb-6 grid gap-3 sm:grid-cols-3">{indexRows.map(([label, value, format]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><strong className="mt-1 block text-lg text-slate-900">{value === null ? '-' : format(value)}</strong></div>)}</div>{selected && <div className="mb-6 rounded-lg border-2 border-sky-300 bg-sky-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-sky-700">선택한 학교</p><h3 className="mt-1 font-bold text-slate-900">{selected.schoolName}</h3><p className="mt-1 text-xs text-slate-600">1학년 {selected.grade1Students}명 · 배정 단지 {selected.complexCount}개 · 배정 세대수 {selected.households === null ? '-' : `${Math.round(selected.households).toLocaleString()}세대`}</p></div><button type="button" onClick={onClear} className="text-xs font-semibold text-sky-700">선택 해제</button></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span>HHI <strong>{selected.concentration === null ? '-' : selected.concentration.toFixed(3)}</strong></span><span>학생/100세대 <strong>{selected.studentYield === null ? '-' : `${selected.studentYield.toFixed(1)}명`}</strong></span><span>동질성 <strong>{selected.housingHomogeneity === null ? '-' : `${selected.housingHomogeneity}점`}</strong></span></div></div>}</>
}

export default function NewsPage() {
  const [rows, setRows] = useState<ReportScatterRow[]>([])
  const [metric, setMetric] = useState<XMetric>('households')
  const [region, setRegion] = useState('전체')
  const [builtFilter, setBuiltFilter] = useState<FilterOption>('all')
  const [parkingFilter, setParkingFilter] = useState<FilterOption>('all')
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { fetchReportScatterRows().then(setRows).catch((reason) => setError(reason instanceof Error ? reason.message : '리포트 데이터를 불러오지 못했습니다.')).finally(() => setLoading(false)) }, [])
  const filteredRows = useMemo(() => rows.filter((row) => (region === '전체' || row.region === region) && inBuiltYearFilter(row.builtYear, builtFilter) && inParkingFilter(row.parkingRatio, parkingFilter)), [builtFilter, parkingFilter, region, rows])
  const schoolRows = useMemo(() => aggregateSchools(filteredRows), [filteredRows])
  const schoolCount = schoolRows.length
  const missingX = schoolRows.filter((row) => row[metric] === null).length
  const reset = () => { setMetric('households'); setRegion('전체'); setBuiltFilter('all'); setParkingFilter('all'); setSelectedSchoolId(null) }
  return <section className="app-destination app-page overflow-y-auto" aria-labelledby="news-title"><header className="app-page__header"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Report / live data</p><h1 id="news-title">학교와 주거 구조</h1></div><BarChart3 size={24} aria-hidden="true" className="text-slate-400" /></header><div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950"><strong>학교 규모와 단지 규모는 함께 움직일까?</strong><p className="mt-1 text-blue-800">DB의 학교-단지 연결 행을 학교 단위로 집계해 표시합니다. 필터를 바꾸면 산점도와 피벗 요약이 함께 다시 계산됩니다.</p></div><div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Filter size={16} />분석 조건</div><button type="button" onClick={reset} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"><RotateCcw size={13} />초기화</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-semibold text-slate-600">X축<select value={metric} onChange={(event) => setMetric(event.target.value as XMetric)} className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"><option value="households">배정 단지 세대수</option><option value="builtYear">사용승인연도</option><option value="parkingRatio">세대당 주차대수</option></select></label><label className="text-xs font-semibold text-slate-600">지역<select value={region} onChange={(event) => setRegion(event.target.value)} className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900">{REGION_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">연식<select value={builtFilter} onChange={(event) => setBuiltFilter(event.target.value as FilterOption)} className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900">{FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">세대당 주차<select value={parkingFilter} onChange={(event) => setParkingFilter(event.target.value as FilterOption)} className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900">{FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.value === 'before2000' ? '< 0.8대' : option.value === '2000s' ? '0.8-0.99대' : option.value === '2010s' ? '1.0-1.19대' : option.value === '2020s' ? '1.2대 이상' : option.label}</option>)}</select></label></div></div>{loading && <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-10 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" />리포트 데이터를 불러오는 중</div>}{error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}{!loading && !error && <><div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-600"><span className="rounded-full bg-sky-100 px-3 py-1.5">연결 행 {filteredRows.length.toLocaleString()}개</span><span className="rounded-full bg-slate-100 px-3 py-1.5">학교 {schoolCount.toLocaleString()}개</span><span className="rounded-full bg-amber-100 px-3 py-1.5">X축 정보 없음 {missingX.toLocaleString()}개</span></div><div className="mb-6"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-800">{xMetricLabels[metric]} × 1학년 학생수</h2><div className="flex gap-3 text-xs text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />80명 이상</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />80명 미만</span></div></div><ScatterPlot rows={filteredRows} metric={metric} selectedSchoolId={selectedSchoolId} onSelect={(school) => setSelectedSchoolId(school?.schoolId ?? null)} /></div><div><h2 className="mb-2 text-sm font-bold text-slate-800">지역 × 학교 규모 피벗 요약</h2><PivotTable rows={filteredRows} /></div></>}</section>
}
