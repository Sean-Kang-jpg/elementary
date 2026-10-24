import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { DayPlan } from '../../utils/schedule/engine'
import { scheduleKindLabel } from '../../utils/schedule/calendar'
import { withCarePlanningDefaults } from '../../utils/schedule/carePlanning'
import { allowedWeekdays, entryForDay, timeOnDay } from '../../utils/schedule/dayTimes'
import { formatMinutes, toMinutes } from '../../utils/schedule/fromSchoolData'
import type { DayTime, ParticipationStatus, ScheduleEntry, Weekday } from '../../utils/schedule/types'
import ScheduleSubjectIcon from './ScheduleSubjectIcon'

const DAYS = ['월', '화', '수', '목', '금']
const WEEK: Weekday[] = [1, 2, 3, 4, 5]
const STATUS: Record<ParticipationStatus, string> = { considering: '후보', planned: '계획에 포함', applying: '신청 중', confirmed: '참여 확정', rejected: '미선정', cancelled: '취소' }
const same = (a: DayTime | null, b: DayTime | null) => Boolean(a && b && a.start === b.start && a.end === b.end)

/**
 * 일정 카드를 누르면 여는 편집 시트(2026-10-23). 학교 자료에서 온 돌봄·강좌도 시각을 바꿀 수 있다 —
 * 출처 시각은 그대로 남고 이 계획의 시각만 바뀐다. 같은 시각을 쓰는 요일을 미리 골라 두어, 고친 값을
 * 그 요일들에 한 번에 적용한다. 정규수업은 보기만 한다.
 */
export default function EntryEditSheet({ entry, day, onSave, onRemoveDay, onStatus, onClose, extra }: {
  /** 저장된 그대로의 일정(요일별 시각 포함). */
  entry: ScheduleEntry
  day: DayPlan
  onSave: (days: Weekday[], time: DayTime, label?: string) => boolean
  onRemoveDay: () => boolean
  onStatus: (status: ParticipationStatus) => boolean
  onClose: () => void
  extra?: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const weekday = day.weekday
  const shown = withCarePlanningDefaults(entryForDay(entry, weekday))
  const current: DayTime | null = shown.startsAfterSchool && shown.end !== null ? { start: 'dismissal', end: shown.end }
    : shown.start !== null && shown.end !== null ? { start: shown.start, end: shown.end } : null
  const allowed = allowedWeekdays(entry)
  const [label, setLabel] = useState(entry.label)
  const [afterSchool, setAfterSchool] = useState(current?.start === 'dismissal')
  const [start, setStart] = useState(current && current.start !== 'dismissal' ? formatMinutes(current.start) : day.dismissal.at !== null ? formatMinutes(day.dismissal.at) : '')
  const [end, setEnd] = useState(current ? formatMinutes(current.end) : '')
  const onDay = (d: Weekday) => timeOnDay(withCarePlanningDefaults(entryForDay(entry, d)), d)
  // 이 요일과 같은 시각을 쓰는 요일을 미리 고른다. 고친 시각은 고른 요일에만 들어간다.
  const [days, setDays] = useState<Weekday[]>(() => entry.weekdays.filter((d) => d === weekday || same(onDay(d), current)))
  const [error, setError] = useState('')
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => { if (node?.open) node.close() }
  }, [])
  const school = entry.kind === 'school'
  const editableLabel = entry.kind === 'personal' || (!entry.source && entry.kind !== 'school')
  const canStartAfterSchool = entry.kind === 'care' || entry.startsAfterSchool === true
  const toggle = (d: Weekday) => setDays((list) => list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort())

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const to = toMinutes(end)
    const from = afterSchool ? 'dismissal' : toMinutes(start)
    if (to === null || from === null || (from !== 'dismissal' && from >= to)) { setError('시작·종료 시간을 확인해 주세요.'); return }
    if (afterSchool && day.dismissal.at !== null && to <= day.dismissal.at) { setError(`하교(${formatMinutes(day.dismissal.at)}) 뒤의 종료 시간을 넣어 주세요.`); return }
    if (!days.length) { setError('적용할 요일을 하나 이상 골라 주세요.'); return }
    if (editableLabel && !label.trim()) { setError('일정 이름을 입력해 주세요.'); return }
    const time: DayTime = { start: from, end: to }
    const unchanged = label.trim() === entry.label && days.every((d) => entry.weekdays.includes(d) && same(onDay(d), time))
    if (unchanged && !shown.timeAssumption) { onClose(); return }
    if (onSave(days, time, editableLabel ? label : undefined)) onClose()
    else setError('저장하지 못했어요. 다른 탭에서 바뀌었으면 다시 열어 주세요.')
  }

  return <dialog ref={dialog} className="my-calendar-dialog my-entry-sheet my-week-detail" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="my-entry-sheet__head">
      <ScheduleSubjectIcon entry={entry} />
      <div><small>{DAYS[weekday - 1]}요일 · {scheduleKindLabel(entry)}</small><h3 id={titleId}>{entry.label}</h3></div>
      <button type="button" className="my-entry-sheet__close" aria-label="닫기" onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </div>
    {school ? <>
      <p className="my-entry-sheet__time">하교 {day.dismissal.at === null ? '시각 미확인' : `${formatMinutes(day.dismissal.at)} (예상)`}</p>
      <p className="my-help">학교 운영계획으로 만든 예상이에요. 정규수업 시간은 여기서 바꾸지 않아요.</p>
      {entry.source && <small className="my-entry-sheet__source">기준 {entry.source.version}</small>}
    </> : <form onSubmit={submit} className="my-entry-sheet__form">
      {editableLabel && <label className="my-field">일정 이름<input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} /></label>}
      <fieldset className="my-entry-sheet__times">
        <legend>시간</legend>
        {canStartAfterSchool && <label className="my-entry-sheet__check"><input type="checkbox" checked={afterSchool} onChange={(event) => setAfterSchool(event.target.checked)} />하교 직후 시작{day.dismissal.at !== null && ` (${formatMinutes(day.dismissal.at)})`}</label>}
        <div className="my-time-fields">
          <label className="my-field">시작<input type="time" step={300} value={afterSchool ? (day.dismissal.at !== null ? formatMinutes(day.dismissal.at) : '') : start} disabled={afterSchool} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="my-field">종료<input type="time" step={300} value={end} required onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
        {shown.timeAssumption && <p className="my-entry-sheet__hint">학교 시간을 몰라 넣은 기본값({shown.timeAssumption.replace(' 기본 가정', '')})이에요. 실제 시간을 알면 바꿔 주세요.</p>}
      </fieldset>
      <fieldset className="my-entry-sheet__days">
        <legend>적용할 요일</legend>
        <div className="my-entry-sheet__chips">
          {WEEK.map((d) => <button type="button" key={d} aria-pressed={days.includes(d)} disabled={!allowed.includes(d)} onClick={() => toggle(d)}
            title={!allowed.includes(d) ? '이 강좌가 열리지 않는 요일' : undefined}>{DAYS[d - 1]}</button>)}
          {allowed.length > 1 && <button type="button" className="my-entry-sheet__all" onClick={() => setDays(days.length === allowed.length ? [weekday] : allowed)}>
            {days.length === allowed.length ? `${DAYS[weekday - 1]}만` : '모두'}</button>}
        </div>
        <small>고른 요일에 같은 시간으로 넣어요. 고르지 않은 요일은 그대로예요.</small>
      </fieldset>
      <label className="my-field">참여 상태<select value={entry.participation} onChange={(event) => onStatus(event.target.value as ParticipationStatus)}>
        {Object.entries(STATUS).map(([value, text]) => <option value={value} key={value}>{text}</option>)}
      </select></label>
      <p className="my-warning" role="alert">{error}</p>
      <div className="my-entry-sheet__actions">
        <button type="submit" className="my-button my-button--primary">저장</button>
        <button type="button" className="my-button" onClick={() => { if (onRemoveDay()) onClose() }}>{DAYS[weekday - 1]}요일에서 빼기</button>
      </div>
      {entry.source && <small className="my-entry-sheet__source">학교 자료 {entry.source.version} · 바꾼 시간은 이 시간표에만 적용돼요</small>}
    </form>}
    {extra}
  </dialog>
}
