import React, { useState } from 'react'
import type { SchoolAfterschool, SchoolAfterschoolOption, SchoolAfterschoolSection, SchoolCareHours, SchoolCareStatistics, SchoolDayEstimate } from '../../types'

const WEEKDAYS = ['월', '화', '수', '목', '금'] as const
// 막대의 시간축: 정오부터 19시 30분까지. 오전 수업은 하교 시각만 보면 되므로 그리지 않는다.
const T0 = 12 * 60
const T1 = 19 * 60 + 30

const toMin = (value: string | null | undefined): number | null => {
  if (!value) return null
  const [h, m] = value.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const pct = (m: number) => ((Math.min(Math.max(m, T0), T1) - T0) / (T1 - T0)) * 100

interface Span { start: number | null; end: number }

const NOON = 12 * 60

// 저학년 반: 대상 학년 상한이 3학년 이하. '1~6학년' 강좌의 늦은 반은 고학년용이라 막대에 넣지 않는다
// (넣으면 서울 학교별 최종 종료 중앙값이 15:10에서 16:40으로 늦어졌다, 2026-10-14). 적재 규칙과 같다.
const LOWER_GRADE_MAX = 3
const isGrade1 = (section: SchoolAfterschoolSection) => section.grade1 === 'true'
const isLowerGrade = (section: SchoolAfterschoolSection) =>
  isGrade1(section) && section.grade_upper !== null && section.grade_upper <= LOWER_GRADE_MAX
const isTimed = (section: SchoolAfterschoolSection) => Boolean(section.days && section.end)
const isMorning = (section: SchoolAfterschoolSection) => (toMin(section.end) ?? NOON + 1) <= NOON

/**
 * 그날 열리는 반들의 가장 이른 시작과 가장 늦은 끝. 요일을 모르는 반은 넣지 않는다.
 * 오후 막대이므로 정오 전에 끝나는 아침 강좌는 빼고, 1학년 하교 전에 끝나는 반(4교시 날 학년용 반 등)도
 * 그날 1학년이 들을 수 없으니 뺀다. 하교 전에 시작하는 반은 하교부터 그린다(2026-10-15, 잠원초).
 */
const daySpan = (
  options: SchoolAfterschoolOption[],
  day: string,
  include: (section: SchoolAfterschoolSection) => boolean = () => true,
  dismissal: number | null = null,
): Span | null => {
  const earliest = Math.max(NOON, dismissal ?? 0)
  let start: number | null = null
  let end: number | null = null
  for (const option of options) {
    for (const section of option.sections) {
      if (!include(section) || !section.days?.includes(day) || !section.end) continue
      const e = toMin(section.end) as number
      if (e <= earliest) continue
      const raw = toMin(section.start)
      const s = raw === null ? null : Math.max(raw, earliest)
      if (s !== null) start = start === null ? s : Math.min(start, s)
      end = end === null ? e : Math.max(end, e)
    }
  }
  return end === null ? null : { start, end }
}

const Bar: React.FC<{ from: number; to: number; className: string; title: string; style?: React.CSSProperties }> = ({ from, to, className, title, style }) =>
  to > from ? <span className={`absolute ${className}`} style={{ ...style, left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }} title={title} /> : null

const ESTIMATED_CARE_END = 17 * 60

type ListView = 'all' | 'custom' | 'paid' | 'unknown'

// 전학년 반(고학년 위주): 같은 주황을 연한 빗금으로. 저학년 반이 끝난 뒤만 이어 그린다(2026-10-14 시안 '한 줄' 안)
const ALL_GRADE_FILL: React.CSSProperties = { backgroundImage: 'repeating-linear-gradient(135deg, rgba(245, 158, 11, .35) 0 4px, transparent 4px 7px)' }

const sectionTime = (section: SchoolAfterschoolSection) =>
  `${isMorning(section) ? '아침 ' : ''}${section.days ?? '요일 미기재'} ${section.start ? `${section.start}–` : ''}${section.end ?? '시간 미기재'}`

/** 반의 대상 학년: '1·2학년'(저학년) ~ '전학년'. 1학년 대상인지 모르면 빈 문자열. */
const gradeLabel = (section: SchoolAfterschoolSection) => {
  if (section.grade1 !== 'true' && section.school_wide) return '학교 안내 1~6학년'
  if (section.grade1 !== 'true' || section.grade_upper === null) return ''
  if (section.grade_upper >= 6) return '전학년'
  return section.grade_upper <= 2 ? '1·2학년' : `1~${section.grade_upper}학년`
}

/** 같은 대상 학년·요일·시간의 반은 한 줄로 묶는다(분반 A·B 등). */
const sectionLines = (option: SchoolAfterschoolOption) => {
  const lines = new Map<string, { grade: string; lower: boolean; time: string }>()
  for (const section of option.sections) {
    const grade = gradeLabel(section)
    const time = sectionTime(section)
    lines.set(`${grade}|${time}`, { grade, lower: isLowerGrade(section), time })
  }
  return [...lines.values()]
}

/**
 * 초1 오후 한눈에: 요일마다 하교·맞춤형·방과후·돌봄을 한 막대에 겹쳐 보여 주고,
 * 돌봄 없이 강좌만 들을 때 데리러 가는 시각을 먼저 답한다. 값은 운영계획 기준이며
 * 실제 개설·신청은 학교 공지로 확인하도록 한다(팀 검증 레슨: 계획과 실제를 구분).
 *
 * 강좌 시각을 읽은 학교(A·B)만 강좌 막대와 데리러 가는 시각을 그린다. 목록만 있는 학교(C)와
 * 강좌표가 없는 학교(data null)도 하교·돌봄 막대는 그리고, 강좌는 별도 확인이 필요하다고 알린다
 * (2026-10-14 결정).
 */
const AfterschoolSummary: React.FC<{
  data: SchoolAfterschool | null
  day: SchoolDayEstimate | null
  care: SchoolCareHours | null
  careStats?: SchoolCareStatistics | null
}> = ({ data, day, care, careStats = null }) => {
  const [open, setOpen] = useState(false)
  // 목록 보기: 맞춤형과 방과후는 신청을 따로 하므로 나눠 보여 준다. 위 숫자 칸을 누르면 그 종류만
  const [view, setView] = useState<ListView>('all')
  const options = data?.options ?? []
  const grade1 = options.filter((o) => o.grade1 === 'true')
  const afterschool = grade1.filter((o) => o.kind === '방과후')
  const custom = options.filter((o) => o.kind === '맞춤형')
  const careEnd = care?.status === 'stated' ? toMin(care.afternoon_end) : null
  const careExt = care?.status === 'stated' ? toMin(care.extended_end) : null
  // 시간 공시는 없지만 학교알리미에 오후돌봄 교실이 있으면 17:00까지로 추정해 점선으로 그린다
  // (시간을 공시한 학교 중 17:00이 가장 많다: 서울 71%, 경기 56%). 학교 확인이 필요하다고 함께 쓴다.
  const careEstimated = careEnd === null && (careStats?.afternoon_care_rooms ?? 0) > 0
  const careBandEnd = careEnd ?? (careEstimated ? ESTIMATED_CARE_END : null)
  const timedCourses = data !== null && data.tier !== 'C' && options.length > 0
  // 저학년 반이 없는 학교만 전학년 반으로 그리고, 그렇다고 밝힌다
  const lowerBasis = afterschool.some((o) => o.sections.some((s) => isLowerGrade(s) && isTimed(s)))
  const afterschoolSection = lowerBasis ? isLowerGrade : isGrade1
  // 진한 막대에 넣지 않은 방과후 반: 전학년 반과 대상 학년이 적혀 있지 않은 반. 빗금으로 이어 그린다
  // (방배초처럼 A반·B반을 시간으로만 나누고 학년을 적지 않은 학교는 이것만 있다, 2026-10-15)
  const allPaid = options.filter((o) => o.kind === '방과후')
  // 막대·데리러 가는 시각에 들어가지 못한 방과후 강좌: 반 어디에도 요일·종료 시각이 없다(서초초 26개 등)
  const untimedPaid = timedCourses ? allPaid.filter((o) => !o.sections.some(isTimed)).length : 0
  const unknownGradeSections = allPaid.some((o) => o.sections.some((s) => !isGrade1(s) && isTimed(s)))
  const extensionLabel = unknownGradeSections ? '전학년·학년 미기재 반' : '전학년 반(고학년 위주)'

  const rows = WEEKDAYS.map((label, index) => {
    const dismissal = toMin(day?.weekdays[index]?.dismissal)
    const c = timedCourses ? daySpan(custom, label, undefined, dismissal) : null
    const a = timedCourses ? daySpan(afterschool, label, afterschoolSection, dismissal) : null
    // 진한 막대 뒤로 더 늦게 이어지는 부분. 데리러 가는 시각에는 넣지 않는다
    const all = timedCourses ? daySpan(allPaid, label, (s) => !afterschoolSection(s), dismissal) : null
    const allFrom = all ? Math.max(all.start ?? a?.end ?? dismissal ?? all.end - 80, a?.end ?? 0) : null
    const ext = all && allFrom !== null && all.end > allFrom ? { start: allFrom, end: all.end } : null
    const pickup = Math.max(dismissal ?? 0, c?.end ?? 0, a?.end ?? 0) || null
    // 이 요일에 열리지만 시각이 없어 막대로 못 그린 방과후 강좌(서초초 '화(주 80분)' 등). 막대 위에 글로 쓴다
    const untimed = allPaid.filter((o) => !o.sections.some(isTimed) && o.sections.some((s) => s.days?.includes(label))).length
    return { label, dismissal, c, a, ext, pickup, untimed }
  })
  const hasExtension = rows.some((row) => row.ext)
  const hasTimeline = timedCourses || careBandEnd !== null || rows.some((row) => row.dismissal !== null)
  if (!hasTimeline && options.length === 0) return null

  const paidUnknown = options.filter((o) => o.kind === '방과후' && o.grade1 !== 'true')
  // 강좌 학년은 없지만 운영계획이 방과후를 1~6학년 대상으로 밝힌 강좌만 남은 경우(2026-10-15)
  const unknownSchoolWide = paidUnknown.length > 0 && paidUnknown.every((o) => o.sections.every((s) => s.school_wide))
  const paidListed = afterschool.length ? afterschool : paidUnknown
  const categories = Object.entries(paidListed.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.category]: (acc[o.category] ?? 0) + 1 }), {}))
    .sort((x, y) => y[1] - x[1])
  const byCategory = (items: SchoolAfterschoolOption[]) => Object.entries(items.reduce<Record<string, SchoolAfterschoolOption[]>>(
    (acc, o) => ({ ...acc, [o.category]: [...(acc[o.category] ?? []), o] }), {})).sort((x, y) => y[1].length - x[1].length)
  const sections = [
    { key: 'custom' as const, title: '맞춤형 프로그램', swatch: 'bg-emerald-500',
      note: '1·2학년 대상이에요. 방과후와 따로 신청해요.', groups: [['', custom]] as [string, SchoolAfterschoolOption[]][] },
    { key: 'paid' as const, title: '방과후 강좌', swatch: 'bg-amber-500',
      note: '1학년이 신청할 수 있는 강좌예요. 맞춤형과 따로 신청해요.', groups: byCategory(afterschool) },
    { key: 'unknown' as const, title: unknownSchoolWide ? '방과후 · 1~6학년 대상(학교 안내)' : '방과후 · 학년 확인 필요', swatch: 'bg-gray-300',
      note: unknownSchoolWide
        ? '강좌마다 대상 학년은 적혀 있지 않지만, 운영계획에 방과후교실은 1~6학년 대상이라고 나와 있어요. 강좌에 따라 학년 제한이 있을 수 있으니 신청 안내에서 확인해 주세요.'
        : '운영계획에 대상 학년이 적혀 있지 않아요. 1학년이 들을 수 있는지 학교에 확인해 주세요.', groups: [['', paidUnknown]] as [string, SchoolAfterschoolOption[]][] },
  ].filter((section) => section.groups.some(([, items]) => items.length) && (view === 'all' || view === section.key))
  const tiles = [
    { key: 'paid' as const, value: afterschool.length, label: '1학년 방과후', on: 'border-amber-400 bg-amber-50' },
    { key: 'custom' as const, value: custom.length, label: '맞춤형', on: 'border-emerald-400 bg-emerald-50' },
    { key: 'unknown' as const, value: paidUnknown.length, label: unknownSchoolWide ? '1~6학년 안내' : '학년 확인 필요', on: 'border-gray-400 bg-gray-50' },
  ]
  const showView = (next: ListView) => {
    if (open && view === next) { setView('all'); return }
    setView(next)
    setOpen(true)
  }

  return (
    <div className="mt-3" data-testid="school-afterschool">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">초1 오후 한눈에</h4>
        {data && <span className="text-[11px] text-gray-500">{data.source_year}학년도 운영계획{data.term ? ` · ${data.term}` : ''}</span>}
      </div>

      {hasTimeline && (
        <>
          <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600" aria-hidden="true">
            <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-gray-300" />수업</span>
            {timedCourses && <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />맞춤형</span>}
            {timedCourses && <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500" />{lowerBasis ? '방과후 저학년 반' : '방과후'}</span>}
            {hasExtension && <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-amber-500" style={ALL_GRADE_FILL} />{extensionLabel}</span>}
            {careEnd !== null && <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-indigo-400 bg-indigo-100" />돌봄</span>}
            {careEstimated && <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-dashed border-indigo-400 bg-indigo-50" />돌봄(17시 추정)</span>}
          </div>

          <ol className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5" aria-label="요일별 오후 일정">
            {rows.map((row) => (
              <li key={row.label} className="contents">
                <span className="text-xs font-semibold text-gray-600">{row.label}</span>
                <div
                  className="relative h-6 rounded bg-gray-50"
                  role="img"
                  aria-label={`${row.label}요일 ${row.dismissal ? `하교 ${fmt(row.dismissal)}` : '하교 시각 미확인'}${row.c ? `, 맞춤형 ~${fmt(row.c.end)}` : ''}${row.a ? `, 방과후 ~${fmt(row.a.end)}` : ''}${row.ext ? `, ${extensionLabel} ~${fmt(row.ext.end)}` : ''}${careEnd ? `, 돌봄 ~${fmt(careEnd)}` : careEstimated ? ', 돌봄 17:00까지로 추정, 학교 확인 필요' : ''}${untimedPaid && row.untimed ? `, 시간 미기재 방과후 ${row.untimed}개` : ''}`}
                >
                  {careEnd && <Bar from={row.dismissal ?? 13 * 60} to={careEnd} className="inset-y-0 rounded-sm border border-indigo-400 bg-indigo-100" title={`돌봄 ~${fmt(careEnd)}`} />}
                  {careEstimated && <Bar from={row.dismissal ?? 13 * 60} to={ESTIMATED_CARE_END} className="inset-y-0 rounded-sm border border-dashed border-indigo-400 bg-indigo-50/60" title="돌봄 17:00까지로 추정 · 학교 확인 필요" />}
                  {careEnd && careExt && <Bar from={careEnd} to={careExt} className="inset-y-0 rounded-r-sm border border-l-0 border-dashed border-indigo-400" title={`저녁·연장 ~${fmt(careExt)}`} />}
                  {row.dismissal && <Bar from={T0} to={row.dismissal} className="inset-y-1 rounded-sm bg-gray-300" title={`하교 ${fmt(row.dismissal)}`} />}
                  {/* 맞춤형은 위 칸, 방과후는 아래 칸: 시간이 겹쳐도 둘 다 보인다 */}
                  {row.c && <Bar from={row.c.start ?? row.dismissal ?? row.c.end - 80} to={row.c.end} className="top-1 h-[7px] rounded-sm bg-emerald-500" title={`맞춤형 ~${fmt(row.c.end)}`} />}
                  {row.a && <Bar from={row.a.start ?? row.dismissal ?? row.a.end - 80} to={row.a.end} className="top-[13px] h-[7px] rounded-sm bg-amber-500" title={`방과후 ~${fmt(row.a.end)}`} />}
                  {row.ext && <Bar from={row.ext.start} to={row.ext.end} className="top-[13px] h-[7px] rounded-sm border border-amber-500" style={ALL_GRADE_FILL} title={`전학년 반 ~${fmt(row.ext.end)}`} />}
                  {untimedPaid > 0 && row.untimed > 0 && (
                    <span className="absolute inset-y-0 right-1 flex items-center" aria-hidden="true">
                      <span className="rounded border border-dashed border-amber-400 bg-white/90 px-1 text-[10px] leading-4 text-amber-800">방과후 {row.untimed} · 시간 미기재</span>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="relative ml-[1.75rem] mt-1 h-3.5 text-[10px] text-gray-400" aria-hidden="true">
            {[12, 14, 16, 18].map((h) => <span key={h} className="absolute -translate-x-1/2" style={{ left: `${pct(h * 60)}%` }}>{h}시</span>)}
          </div>
          {untimedPaid > 0 && (
            <p className="mt-1 text-[11px] leading-4 text-amber-800" data-testid="school-afterschool-untimed">
              방과후 {untimedPaid}개 강좌는 운영계획에 {rows.some((row) => row.untimed) ? '요일만 있고 ' : ''}시간이 적혀 있지 않아 막대와 데리러 가는 시각에 넣지 않았어요. 신청 안내에서 시간을 확인하고, MY 시간표에 직접 넣을 수 있어요.
            </p>
          )}
          {careEnd === null && (
            <p className="mt-1.5 rounded-md bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-950" data-testid="school-afterschool-care-note">
              {(careStats?.afternoon_care_rooms ?? 0) > 0
                ? `돌봄교실은 운영해요(오후 ${careStats!.afternoon_care_rooms}실${(careStats!.evening_care_rooms ?? 0) > 0 ? `·저녁 ${careStats!.evening_care_rooms}실` : ''}, 학교알리미). `
                : ''}
              {careEstimated ? '운영 시간은 공시 문서에 없어 점선은 17:00까지로 추정한 거예요.' : '돌봄 운영 시간은 공시 문서에 없어 막대에 넣지 않았어요.'} 시간을 공시한 학교는 오후 돌봄이 17:00까지인 곳이 가장 많고(서울 71%, 경기 56%), 19:00까지인 곳도 있어요. 이 학교 시간은 학교에 확인해 주세요.
            </p>
          )}
        </>
      )}

      {timedCourses ? (
        <div className="mt-2.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p className="font-medium">돌봄 없이 강좌만 들으면 데리러 가는 시각</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
            {rows.map((row) => <span key={row.label}>{row.label} <strong>{row.pickup ? fmt(row.pickup) : '–'}</strong></span>)}
          </p>
          <p className="mt-1 text-[11px] text-amber-800">
            {lowerBasis || !afterschool.length
              ? `그날 가장 늦게 끝나는 저학년 대상 반 기준이에요.${hasExtension ? ` 빗금은 ${unknownGradeSections ? '전학년 반이거나 대상 학년이 적혀 있지 않은 반이라' : '전학년 반이라'} 고르면 그만큼 늦어질 수 있어요.` : ' 고른 강좌에 따라 더 이를 수 있어요.'}`
              : '저학년 반이 따로 적혀 있지 않아 전학년 대상 반 기준이에요. 늦은 반은 고학년용일 수 있어요.'}
          </p>
        </div>
      ) : (
        <div className="mt-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950" data-testid="school-afterschool-check">
          <p className="font-semibold">방과후·맞춤형 시간은 별도 확인이 필요해요</p>
          <p className="mt-0.5">
            {options.length > 0
              ? `운영계획에 강좌 ${grade1.length ? '시간' : '대상 학년'}이 적혀 있지 않아 강좌 목록만 보여 드려요.`
              : '이 학교의 1학년 강좌 시간표는 아직 확인하지 못했어요. 학교 홈페이지 공지나 가정통신문으로 확인해 주세요.'}
            {' '}MY 시간표에서 요일·시간을 직접 넣을 수 있어요.
          </p>
        </div>
      )}

      {options.length > 0 && (
        <>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center" role="group" aria-label="종류별로 강좌 보기">
            {tiles.map((tile) => (
              <button
                key={tile.key}
                type="button"
                disabled={tile.value === 0}
                aria-pressed={open && view === tile.key}
                onClick={() => showView(tile.key)}
                className={`rounded-md border px-1 py-1.5 disabled:opacity-50 ${open && view === tile.key ? tile.on : 'border-gray-200'}`}
              >
                <strong className="block text-base leading-tight text-gray-950">{tile.value}</strong>
                <span className="block text-[11px] text-gray-600">{tile.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {categories.map(([category, count]) => (
              <span key={category} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800">{category} {count}</span>
            ))}
          </div>

          <button
            type="button"
            className="mt-2.5 w-full rounded-md border border-gray-200 py-2 text-sm font-semibold text-indigo-800"
            aria-expanded={open}
            onClick={() => {
              if (open && view !== 'all') { setView('all'); return }
              setView('all')
              setOpen((value) => !value)
            }}
          >
            {open && view === 'all' ? '강좌 접기' : `강좌 ${options.length}개 모두 보기`}
          </button>
          {open && (
            <div className="mt-2 space-y-4">
              {sections.map((section) => (
                <section key={section.key} aria-label={section.title}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-gray-200 pb-1">
                    <h5 className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><i className={`h-2.5 w-2.5 rounded-sm ${section.swatch}`} aria-hidden="true" />{section.title}</h5>
                    <span className="text-[11px] text-gray-500">{section.groups.reduce((sum, [, items]) => sum + items.length, 0)}개</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-gray-500">{section.note}</p>
                  {section.groups.filter(([, items]) => items.length).map(([category, items]) => (
                    <div key={category || section.key} className="mt-1.5">
                      {category && <h6 className="text-xs font-semibold text-gray-600">{category} · {items.length}</h6>}
                      <ul className="divide-y divide-gray-100">
                        {items.map((option) => (
                          <li key={`${option.kind}-${option.name}-${option.variant ?? ''}`} className="py-1.5 text-sm">
                            <span className="text-gray-900">
                              {option.name}
                              {option.variant && <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-800">수준 {option.variant}</span>}
                            </span>
                            {/* 반마다 대상 학년을 붙인다: 같은 강좌에 1·2학년 반과 전학년 반이 함께 있는 학교가 많다 */}
                            <ul className="mt-0.5 space-y-0.5">
                              {sectionLines(option).map((line) => (
                                <li key={`${line.grade}|${line.time}`} className="flex items-center gap-1.5 text-[11px] tabular-nums text-gray-600">
                                  {line.grade && option.kind === '방과후' && (
                                    <span className={`shrink-0 rounded px-1 text-[10px] font-medium ${line.lower ? 'bg-amber-100 text-amber-900' : 'border border-amber-300 text-amber-800'}`}>{line.grade}</span>
                                  )}
                                  <span>{line.time}</span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] leading-4 text-gray-500">운영계획상 예정이에요. 공시 문서를 자동으로 정리한 값이라 틀릴 수 있어요. 실제 개설·폐강과 신청 일정은 학교 공지로 확인해 주세요.</p>
        </>
      )}
    </div>
  )
}

export default AfterschoolSummary
