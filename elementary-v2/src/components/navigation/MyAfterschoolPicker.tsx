import { useEffect, useState } from 'react'
import { getSchoolAfterschool, getSchoolDayEstimate } from '../../services/dataService'
import type { SchoolAfterschool, SchoolCareHours } from '../../types'
import { afterschoolEntryFromSection, afterschoolSectionId, afterschoolSectionLabel, careEntriesFromHours, formatMinutes } from '../../utils/schedule/fromSchoolData'
import { scheduleEntryHeading } from '../../utils/schedule/calendar'
import ScheduleSubjectIcon from './ScheduleSubjectIcon'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'
import { isProgramDaySelected } from '../../utils/schedule/programSelection'
import MorningCareScheduleChoice from './MorningCareScheduleChoice'
import RepeatDays from './RepeatDays'
import { morningCareFromLegacy } from '../../utils/morningCare'

export interface EntryDraft {
  id: string
  label: string
  start: string
  end: string
  source: ScheduleEntry['source']
  kind?: 'care' | 'afterschool'
}

const FILTERS = ['전체', '돌봄', '맞춤형', '방과후'] as const
const included = (entry?: ScheduleEntry) => Boolean(entry && ['planned', 'applying', 'confirmed'].includes(entry.participation))

/** 선택한 반만 계획에 넣는다. 출처의 시간과 실제 신청·참여 여부는 별개다. */
export default function MyAfterschoolPicker({ schoolId, entries, onAdd, onRemove, onDraft, weekday, onToggleDay, onRepeat, onRemoveDay }: {
  schoolId: string
  entries: ScheduleEntry[]
  onAdd: (entry: ScheduleEntry) => boolean
  onRemove: (id: string) => boolean
  onDraft: (draft: EntryDraft) => void
  weekday?: Weekday
  onToggleDay?: (entry: ScheduleEntry, weekday: Weekday) => boolean
  /** 요일 카드에서 고른 항목을 다른 요일에도 넣는다. */
  onRepeat?: (id: string, from: Weekday, targets: Weekday[]) => boolean
  onRemoveDay?: (id: string, weekday: Weekday) => boolean
}) {
  const repeat = (id: string, selected: boolean) => weekday && selected && onRepeat && onRemoveDay
    ? <RepeatDays entry={entries.find((e) => e.id === id)} weekday={weekday} onRepeat={onRepeat} onRemoveDay={onRemoveDay} /> : null
  const [data, setData] = useState<SchoolAfterschool | null>(null)
  const [care, setCare] = useState<SchoolCareHours | null>(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [retry, setRetry] = useState(0)
  const [filter, setFilter] = useState<typeof FILTERS[number]>('전체')
  const [query, setQuery] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true)
    setErrors([])
    Promise.allSettled([
      getSchoolAfterschool(schoolId, { allowDevFixture: false }),
      getSchoolDayEstimate(schoolId, { allowDevFixture: false }),
    ]).then(([courses, day]) => {
      if (!active) return
      setData(courses.status === 'fulfilled' ? courses.value : null)
      setCare(day.status === 'fulfilled' ? day.value.care : null)
      setErrors([...(courses.status === 'rejected' ? ['강좌'] : []), ...(day.status === 'rejected' ? ['돌봄'] : [])])
      setLoading(false)
    })
    return () => { active = false }
  }, [schoolId, retry])

  const options = (data?.options ?? []).map((option) => ({ ...option, sections: weekday
    ? option.sections.filter((section) => section.days?.includes('월화수목금'[weekday - 1])) : option.sections }))
    .filter((option) => option.sections.length > 0).sort((a, b) => Number(b.grade1 === 'true') - Number(a.grade1 === 'true'))
  const search = query.trim().toLocaleLowerCase()
  const matches = (text: string) => text.toLocaleLowerCase().includes(search)
  const courses = options.filter((o) => (filter === '전체' || filter === o.kind) && matches(`${o.name} ${o.variant ?? ''} ${o.category}`))
  const careOptions = errors.includes('돌봄') ? [] : careEntriesFromHours(care ?? {
    school_id: schoolId, source_year: 0, status: 'school_check_needed', afternoon_end: null,
    extended_end: null, extended_condition: null, morning_hours: null, grades: null, source: '운영시간 미확인',
  }).filter((e) => (filter === '전체' || filter === '돌봄') && matches(e.label))
  const selectedCount = entries.filter((e) => e.kind !== 'school' && (weekday ? isProgramDaySelected(e, weekday) : included(e))).length
  // 등급은 방과후·맞춤형 중 나은 쪽이라(2026-10-15) A 학교에도 시간 없는 반이 있다. 안내는 반 기준으로 한다
  const untimed = options.filter((o) => o.sections.some((s) => !s.days || !s.end)).length

  return <section className="my-course-picker" aria-label="과목·돌봄 선택" aria-busy={loading}>
    <div className="my-course-picker__heading"><h3>{weekday ? `${'월화수목금'[weekday - 1]}요일 강좌·돌봄` : '과목·돌봄 선택'}</h3><span>계획에 포함 {selectedCount}개</span></div>
    <p className="my-help">{weekday ? '선택하면 이 요일만 추가돼요. 돌봄도 함께 고를 수 있어요.' : '반을 선택하면 요일·시간이 자동으로 채워져요. 다시 누르면 시간표에서 빠져요. 선택은 신청·참여 확정과 별개예요.'}</p>
    {!weekday && <p className="my-help">돌봄과 방과후·맞춤형은 함께 선택할 수 있어요. 수업을 마친 뒤 돌봄으로 이어지는 계획도 만들 수 있어요.</p>}
    {loading ? <p role="status" className="my-help">학교 강좌·돌봄 자료를 불러오는 중…</p> : <>
      {errors.length > 0 && <div className="my-actions"><p role="alert" className="my-warning">{errors.join('·')} 자료를 불러오지 못했어요.</p><button type="button" className="my-button" onClick={() => setRetry((n) => n + 1)}>자료 다시 불러오기</button></div>}
      {!errors.includes('돌봄') && (filter === '전체' || filter === '돌봄') && matches('아침돌봄 아침 돌봄') && <MorningCareScheduleChoice key={schoolId} schoolId={schoolId} info={morningCareFromLegacy(care)} entries={entries} onAdd={onAdd} onRemove={onRemove} weekday={weekday} onToggleDay={onToggleDay} onRepeat={onRepeat} onRemoveDay={onRemoveDay} />}
      {(!errors.includes('돌봄') || data?.options.length || care) ? <>
        <div className="my-course-filters" role="group" aria-label="프로그램 유형">
          {FILTERS.map((value) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}
        </div>
        <label className="my-field">과목 찾기<input type="search" value={query} placeholder="예: 미술, 컴퓨터" onChange={(event) => setQuery(event.target.value)} /></label>
        {data && <p className="my-help my-course-source">강좌 {data.source_year}학년도{data.term ? ` · ${data.term}` : ''} 운영계획{weekday ? ' · 선택은 신청 확정과 별개예요.' : untimed === options.length && untimed > 0 ? ' · 요일·시간 확인이 필요한 목록이에요.' : untimed > 0 ? ` · ${untimed}개 강좌는 요일·시간이 적혀 있지 않아 직접 입력해요.` : ''}</p>}
        {!data && !errors.includes('강좌') && <p className="my-help">이 학교의 방과후·맞춤형 강좌 자료는 아직 확인하지 못했어요. 학교 공지를 보고 일정을 직접 추가할 수 있어요.</p>}
        {!care && !errors.includes('돌봄') && <p className="my-help">이 학교의 돌봄 운영 시간은 아직 확인하지 못했어요.</p>}
        <ul className="my-course-options" aria-label="선택 가능한 과목·돌봄">
          {careOptions.map((entry) => {
            const existing = entries.find((e) => e.id === entry.id)
            const selected = weekday ? isProgramDaySelected(existing, weekday) : included(existing)
            const time = `${entry.startsAfterSchool ? '하교 후' : formatMinutes(entry.start!)}–${entry.end === null ? '종료 미확인' : formatMinutes(entry.end)}`
            return <li key={entry.id}>
              <small>{weekday ? `${'월화수목금'[weekday - 1]}요일에 선택` : '월~금'} · {care ? `${care.source_year}학년도` : '학년도 미확인'} · 대상 {care?.grades ?? '학교 확인 필요'}</small>
              <button type="button" className="my-course-choice my-course-choice--care" aria-pressed={selected} aria-label={`${scheduleEntryHeading(entry)} ${weekday ? `${'월화수목금'[weekday - 1]}요일` : '월~금'} ${time} ${selected ? '선택 해제' : entry.end === null ? '종료시간 입력' : '시간표에 넣기'}`} onClick={() => {
                if (!selected && entry.end === null && !existing?.end) onDraft({ id: entry.id, kind: 'care', label: entry.label, start: formatMinutes(entry.start!), end: '', source: undefined })
                else if (weekday && onToggleDay) onToggleDay(entry, weekday)
                else if (selected) onRemove(entry.id)
                else onAdd({ ...(existing ?? entry), participation: 'planned', transitionIn: 'unknown' })
              }}>
                <span className="my-course-choice__lines"><b><ScheduleSubjectIcon entry={entry} /><span className="my-entry-title">{scheduleEntryHeading(entry)}</span></b><span>{time}{entry.timeAssumption && ' · 기본 가정'}</span></span><i aria-hidden="true">{selected ? '✓' : '+'}</i>
              </button>
              {repeat(entry.id, selected)}
              {entry.timeAssumption && <small>운영시간 미확인 · 계획용 기본 시간이에요. 넣은 뒤 시간표의 카드를 눌러 실제 시간으로 바꿀 수 있어요.</small>}
              {entry.label === '저녁·연장 돌봄' && <small>{care?.extended_condition ?? (entry.end === null ? '오후돌봄 이후로 이어져요. 확인한 종료시간을 입력해 주세요.' : '')}</small>}
            </li>
          })}
          {courses.map((option) => <li key={`${option.kind}-${option.name}-${option.variant ?? ''}`}>
            <div className="my-course-sections">
              {option.sections.map((section, index) => {
                const id = afterschoolSectionId(schoolId, option, section)
                const existing = entries.find((e) => e.id === id)
                const selected = weekday ? isProgramDaySelected(existing, weekday) : included(existing)
                const entry = afterschoolEntryFromSection(schoolId, data!.source_year, option, section, 'planned')
                const time = `${section.days ?? '요일 미확인'} · ${section.start ?? '시작 미확인'} ~ ${section.end ?? '종료 미확인'}`
                const grade = section.grade1 !== 'true' ? (section.school_wide ? '1~6학년 대상(학교 안내)' : '1학년 대상 확인 필요') : section.grade_upper === null ? '1학년 포함' : section.grade_upper === 6 ? '전학년' : `1~${section.grade_upper}학년`
                return <div className="my-course-section" key={`${id}-${index}`}>
                  <small className="my-course-meta">{option.category} · {section.days ?? '요일 미확인'} · {grade}</small>
                  <button type="button" className={`my-course-choice${option.kind === '맞춤형' ? ' my-course-choice--custom' : ''}`} aria-pressed={selected}
                    data-program-label={afterschoolSectionLabel(option, section)}
                    aria-label={`${scheduleEntryHeading({ kind: 'afterschool', label: afterschoolSectionLabel(option, section) })} ${time} ${grade} ${selected ? '선택 해제' : entry || existing ? '시간표에 넣기' : '요일 입력하기'}`}
                    onClick={() => {
                      if (weekday && onToggleDay && entry) onToggleDay(entry, weekday)
                      else if (selected) onRemove(id)
                      else if (existing || entry) onAdd({ ...(existing ?? entry!), participation: 'planned' })
                      else onDraft({ id, label: afterschoolSectionLabel(option, section), start: section.start ?? '', end: section.end ?? '', source: { ref: `school_afterschool:${schoolId}`, version: `${data!.source_year} 운영계획` } })
                    }}>
                    <span className="my-course-choice__lines"><b><ScheduleSubjectIcon entry={{ kind: 'afterschool', label: option.name }} /><span className="my-entry-title">{scheduleEntryHeading({ kind: 'afterschool', label: afterschoolSectionLabel(option, section) })}</span></b><span>{section.start ?? '시작 미확인'}–{section.end ?? '종료 미확인'}</span></span><i aria-hidden="true">{selected ? '✓' : '+'}</i>
                  </button>
                  {repeat(id, selected)}
                </div>
              })}
            </div>
          </li>)}
          {!careOptions.length && !courses.length && <li className="my-help">조건에 맞는 과목이 없어요. 다른 유형이나 검색어로 찾아보세요.</li>}
        </ul>
        {weekday && <p className="my-help">요일 미확인 강좌는 이 목록에서 제외했어요. 돌봄 이용 요일·대상·이동 조건은 학교에 확인해 주세요.</p>}
      </> : !errors.length && <p className="my-help">이 학교의 강좌·돌봄 운영 자료는 아직 확인하지 못했어요. 학교 공지를 보고 위의 ‘직접 입력’에서 추가해 주세요.</p>}
    </>}
  </section>
}
