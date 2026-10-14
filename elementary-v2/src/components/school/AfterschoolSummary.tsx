import React, { useState } from 'react'
import type { SchoolAfterschool, SchoolAfterschoolOption, SchoolAfterschoolSection, SchoolCareHours, SchoolDayEstimate } from '../../types'

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

// 저학년 반: 대상 학년 상한이 3학년 이하. '1~6학년' 강좌의 늦은 반은 고학년용이라 막대에 넣지 않는다
// (넣으면 서울 학교별 최종 종료 중앙값이 15:10에서 16:40으로 늦어졌다, 2026-10-14). 적재 규칙과 같다.
const LOWER_GRADE_MAX = 3
const isGrade1 = (section: SchoolAfterschoolSection) => section.grade1 === 'true'
const isLowerGrade = (section: SchoolAfterschoolSection) =>
  isGrade1(section) && section.grade_upper !== null && section.grade_upper <= LOWER_GRADE_MAX
const isTimed = (section: SchoolAfterschoolSection) => Boolean(section.days && section.end)

/** 그날 열리는 반들의 가장 이른 시작과 가장 늦은 끝. 요일을 모르는 반은 넣지 않는다. */
const daySpan = (options: SchoolAfterschoolOption[], day: string, include: (section: SchoolAfterschoolSection) => boolean = () => true): Span | null => {
  let start: number | null = null
  let end: number | null = null
  for (const option of options) {
    for (const section of option.sections) {
      if (!include(section) || !section.days?.includes(day) || !section.end) continue
      const s = toMin(section.start)
      const e = toMin(section.end) as number
      if (s !== null) start = start === null ? s : Math.min(start, s)
      end = end === null ? e : Math.max(end, e)
    }
  }
  return end === null ? null : { start, end }
}

const Bar: React.FC<{ from: number; to: number; className: string; title: string; style?: React.CSSProperties }> = ({ from, to, className, title, style }) =>
  to > from ? <span className={`absolute ${className}`} style={{ ...style, left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }} title={title} /> : null

// 전학년 반(고학년 위주): 같은 주황을 연한 빗금으로. 저학년 반이 끝난 뒤만 이어 그린다(2026-10-14 시안 '한 줄' 안)
const ALL_GRADE_FILL: React.CSSProperties = { backgroundImage: 'repeating-linear-gradient(135deg, rgba(245, 158, 11, .35) 0 4px, transparent 4px 7px)' }

const sectionTimes = (option: SchoolAfterschoolOption) =>
  [...new Set(option.sections.map((s) => `${s.days ?? '요일?'} ${s.start ? `${s.start}–` : ''}${s.end ?? '시간?'}`))].join(' · ')

/**
 * 초1 오후 한눈에: 요일마다 하교·맞춤형·방과후·돌봄을 한 막대에 겹쳐 보여 주고,
 * 돌봄 없이 강좌만 들을 때 데리러 가는 시각을 먼저 답한다. 값은 운영계획 기준이며
 * 실제 개설·신청은 학교 공지로 확인하도록 한다(팀 검증 레슨: 계획과 실제를 구분).
 *
 * 강좌 시각을 읽은 학교(A·B)만 강좌 막대와 데리러 가는 시각을 그린다. 목록만 있는 학교(C)와
 * 강좌표가 없는 학교(data null)도 하교·돌봄 막대는 그리고, 강좌는 별도 확인이 필요하다고 알린다
 * (2026-10-14 결정).
 */
const AfterschoolSummary: React.FC<{ data: SchoolAfterschool | null; day: SchoolDayEstimate | null; care: SchoolCareHours | null }> = ({ data, day, care }) => {
  const [open, setOpen] = useState(false)
  const options = data?.options ?? []
  const grade1 = options.filter((o) => o.grade1 === 'true')
  const unknown = options.filter((o) => o.grade1 !== 'true')
  const afterschool = grade1.filter((o) => o.kind === '방과후')
  const custom = options.filter((o) => o.kind === '맞춤형')
  const careEnd = care?.status === 'stated' ? toMin(care.afternoon_end) : null
  const careExt = care?.status === 'stated' ? toMin(care.extended_end) : null
  const timedCourses = data !== null && data.tier !== 'C' && options.length > 0
  // 저학년 반이 없는 학교만 전학년 반으로 그리고, 그렇다고 밝힌다
  const lowerBasis = afterschool.some((o) => o.sections.some((s) => isLowerGrade(s) && isTimed(s)))
  const afterschoolSection = lowerBasis ? isLowerGrade : isGrade1

  const rows = WEEKDAYS.map((label, index) => {
    const dismissal = toMin(day?.weekdays[index]?.dismissal)
    const c = timedCourses ? daySpan(custom, label) : null
    const a = timedCourses ? daySpan(afterschool, label, afterschoolSection) : null
    // 저학년 기준인 학교에서 전학년 반이 더 늦게 이어지는 부분. 데리러 가는 시각에는 넣지 않는다
    const all = timedCourses && lowerBasis ? daySpan(afterschool, label, (s) => isGrade1(s) && !isLowerGrade(s)) : null
    const allFrom = all ? Math.max(all.start ?? a?.end ?? dismissal ?? all.end - 80, a?.end ?? 0) : null
    const ext = all && allFrom !== null && all.end > allFrom ? { start: allFrom, end: all.end } : null
    const pickup = Math.max(dismissal ?? 0, c?.end ?? 0, a?.end ?? 0) || null
    return { label, dismissal, c, a, ext, pickup }
  })
  const hasExtension = rows.some((row) => row.ext)
  const hasTimeline = timedCourses || careEnd !== null || rows.some((row) => row.dismissal !== null)
  if (!hasTimeline && options.length === 0) return null

  const listed = grade1.length ? grade1 : unknown
  const categories = Object.entries(listed.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.category]: (acc[o.category] ?? 0) + 1 }), {}))
    .sort((x, y) => y[1] - x[1])
  const groups = categories.map(([category]) => [category, listed.filter((o) => o.category === category)] as const)

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
            {hasExtension && <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-amber-500" style={ALL_GRADE_FILL} />전학년 반(고학년 위주)</span>}
            <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-indigo-400 bg-indigo-100" />돌봄</span>
          </div>

          <ol className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5" aria-label="요일별 오후 일정">
            {rows.map((row) => (
              <li key={row.label} className="contents">
                <span className="text-xs font-semibold text-gray-600">{row.label}</span>
                <div
                  className="relative h-6 rounded bg-gray-50"
                  role="img"
                  aria-label={`${row.label}요일 ${row.dismissal ? `하교 ${fmt(row.dismissal)}` : '하교 시각 미확인'}${row.c ? `, 맞춤형 ~${fmt(row.c.end)}` : ''}${row.a ? `, 방과후 ~${fmt(row.a.end)}` : ''}${row.ext ? `, 전학년 반 ~${fmt(row.ext.end)}` : ''}${careEnd ? `, 돌봄 ~${fmt(careEnd)}` : ''}`}
                >
                  {careEnd && <Bar from={row.dismissal ?? 13 * 60} to={careEnd} className="inset-y-0 rounded-sm border border-indigo-400 bg-indigo-100" title={`돌봄 ~${fmt(careEnd)}`} />}
                  {careEnd && careExt && <Bar from={careEnd} to={careExt} className="inset-y-0 rounded-r-sm border border-l-0 border-dashed border-indigo-400" title={`저녁·연장 ~${fmt(careExt)}`} />}
                  {row.dismissal && <Bar from={T0} to={row.dismissal} className="inset-y-1 rounded-sm bg-gray-300" title={`하교 ${fmt(row.dismissal)}`} />}
                  {/* 맞춤형은 위 칸, 방과후는 아래 칸: 시간이 겹쳐도 둘 다 보인다 */}
                  {row.c && <Bar from={row.c.start ?? row.dismissal ?? row.c.end - 80} to={row.c.end} className="top-1 h-[7px] rounded-sm bg-emerald-500" title={`맞춤형 ~${fmt(row.c.end)}`} />}
                  {row.a && <Bar from={row.a.start ?? row.dismissal ?? row.a.end - 80} to={row.a.end} className="top-[13px] h-[7px] rounded-sm bg-amber-500" title={`방과후 ~${fmt(row.a.end)}`} />}
                  {row.ext && <Bar from={row.ext.start} to={row.ext.end} className="top-[13px] h-[7px] rounded-sm border border-amber-500" style={ALL_GRADE_FILL} title={`전학년 반 ~${fmt(row.ext.end)}`} />}
                </div>
              </li>
            ))}
          </ol>
          <div className="relative ml-[1.75rem] mt-1 h-3.5 text-[10px] text-gray-400" aria-hidden="true">
            {[12, 14, 16, 18].map((h) => <span key={h} className="absolute -translate-x-1/2" style={{ left: `${pct(h * 60)}%` }}>{h}시</span>)}
          </div>
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
              ? `그날 가장 늦게 끝나는 저학년 대상 반 기준이에요.${hasExtension ? ' 빗금은 전학년 반이라 고르면 그만큼 늦어질 수 있어요.' : ' 고른 강좌에 따라 더 이를 수 있어요.'}`
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
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
            {[[afterschool.length, '1학년 방과후'], [custom.length, '맞춤형(무료)'], [unknown.length, '학년 확인 필요']].map(([value, label]) => (
              <div key={label} className="rounded-md border border-gray-200 px-1 py-1.5">
                <strong className="block text-base leading-tight text-gray-950">{value}</strong>
                <span className="text-[11px] text-gray-600">{label}</span>
              </div>
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
            onClick={() => setOpen((value) => !value)}
          >
            {open ? '강좌 접기' : `강좌 ${options.length}개 모두 보기`}
          </button>
          {open && (
            <div className="mt-2 space-y-3">
              {[...groups, ...(unknown.length && grade1.length ? [['학년 확인 필요', unknown] as const] : [])].map(([category, items]) => (
                <div key={category}>
                  <h5 className="mb-0.5 text-xs font-semibold text-gray-600">{category} · {items.length}</h5>
                  <ul className="divide-y divide-gray-100">
                    {items.map((option) => (
                      <li key={`${option.kind}-${option.name}-${option.variant ?? ''}`} className="flex justify-between gap-2 py-1.5 text-sm">
                        <span className="min-w-0 text-gray-900">
                          {option.name}
                          {option.variant && <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-800">수준 {option.variant}</span>}
                          {option.kind === '맞춤형' && <span className="ml-1 rounded bg-emerald-50 px-1 text-[10px] text-emerald-800">맞춤형·무료</span>}
                          {option.grade1 !== 'true' && <span className="ml-1 rounded border border-gray-200 px-1 text-[10px] text-gray-600">학년 확인 필요</span>}
                          {option.kind === '방과후' && option.grade1 === 'true' && !option.sections.some(isLowerGrade) && <span className="ml-1 rounded border border-gray-200 px-1 text-[10px] text-gray-600">전학년</span>}
                        </span>
                        <span className="max-w-[55%] shrink-0 text-right text-[11px] tabular-nums text-gray-500">{sectionTimes(option)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] leading-4 text-gray-500">운영계획상 예정이에요. 실제 개설·폐강과 신청 일정은 학교 공지로 확인해 주세요.</p>
        </>
      )}
    </div>
  )
}

export default AfterschoolSummary
