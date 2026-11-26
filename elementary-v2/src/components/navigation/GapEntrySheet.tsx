import { useState, type FormEvent } from 'react'
import { allowedWeekdays, timeOnDay } from '../../utils/schedule/dayTimes'
import type { CalendarRange } from '../../utils/schedule/editing'
import { WEEKDAYS } from '../../utils/schedule/engine'
import { formatMinutes, toMinutes } from '../../utils/schedule/fromSchoolData'
import { openGapEdit, type GapEdit } from '../../utils/schedule/gapEditing'
import type { DayTime, ParticipationStatus, ScheduleEntry } from '../../utils/schedule/types'
import GapDialog from './GapDialog'
import { DAY_NAMES, entryType } from './MyScheduleDay'

const STATUS: Record<ParticipationStatus, string> = {
  considering: '후보', planned: '계획에 포함', applying: '신청 중', confirmed: '확정', rejected: '미선정', cancelled: '취소',
}

const TYPES = ['care', 'afterschool', 'academy', 'personal'] as const
const TYPE_NAMES: Record<(typeof TYPES)[number], string> = { care: '돌봄', afterschool: '방과후', academy: '학원', personal: '개인' }
// 미선정·취소는 숨긴 일정 목록에서 다룬다. 시트에서는 지금 고르는 세 단계만.
const SHOWN_STATUS: ParticipationStatus[] = ['considering', 'planned', 'applying', 'confirmed']

export default function GapEntrySheet({ range, gap, entry, suggestions, reasons, onClose, onSave, onCourse, onRemove }: {
  range: CalendarRange
  gap?: [number, number]
  entry?: ScheduleEntry
  suggestions: ScheduleEntry[]
  reasons: string[]
  onClose: () => void
  onSave: (draft: GapEdit) => boolean
  onCourse: (entry: ScheduleEntry) => boolean
  onRemove: (all: boolean) => boolean
}) {
  const [initial] = useState(() => entry ? {
    label: entry.label, kind: entry.kind === 'school' ? 'personal' as const : entry.kind,
    activityType: entryType(entry) === 'academy' ? 'academy' as const : undefined,
    time: timeOnDay(entry, range.weekday), weekdays: [range.weekday], participation: entry.participation, original: entry,
  } : openGapEdit(range))
  const [label, setLabel] = useState(initial.label)
  const [start, setStart] = useState(typeof initial.time?.start === 'number' ? formatMinutes(initial.time.start) : '')
  const [end, setEnd] = useState(initial.time ? formatMinutes(initial.time.end) : '')
  const [afterSchool, setAfterSchool] = useState(initial.time?.start === 'dismissal')
  const [kind, setKind] = useState(initial.kind)
  const [academy, setAcademy] = useState(initial.activityType === 'academy')
  const [weekdays, setWeekdays] = useState(initial.weekdays)
  const [participation, setParticipation] = useState(initial.participation)
  const [error, setError] = useState('')
  const editable = !entry?.source
  const available = entry ? allowedWeekdays(entry) : WEEKDAYS
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const from = afterSchool ? 'dismissal' : toMinutes(start), to = toMinutes(end)
    const noTimes = Boolean(entry && !start && !end && !afterSchool)
    if (!label.trim() || !weekdays.length || (!noTimes && (from === null || to === null || (typeof from === 'number' && from >= to)))) {
      setError('이름·시작·끝과 적용할 요일을 확인해 주세요.')
      return
    }
    const needsTimeUpdate = weekdays.some(day => {
      const current = entry?.weekdays.includes(day) ? timeOnDay(entry, day) : null
      return current?.start !== from || current?.end !== to
    })
    const time: DayTime | null = !noTimes && from !== null && to !== null && needsTimeUpdate ? { start: from, end: to } : null
    if (onSave({ label, kind, weekdays, participation, time, original: entry, activityType: academy ? 'academy' : undefined })) onClose()
    else setError('저장하지 못했어요. 다른 탭에서 수정했다면 다시 열어 주세요.')
  }
  const day = DAY_NAMES[range.weekday - 1] + '요일'
  const hint = entry ? day + ' · ' + TYPE_NAMES[academy ? 'academy' : kind]
    : gap ? day + ' 빈 시간 ' + formatMinutes(gap[0]) + '–' + formatMinutes(gap[1]) : day + ' · ' + formatMinutes(range.start)
  return <GapDialog title={entry ? '일정 고치기' : gap ? '빈 시간에 넣기' : '일정 넣기'} hint={hint} onClose={onClose}>
    {suggestions.length > 0 && <section className="gap-course" data-testid="gap-courses" aria-label="이 시간에 맞는 학교 강좌">
      <p><span>이 시간에 맞는 학교 강좌 {suggestions.length}</span><span>누르면 바로 넣어요</span></p>
      <div className="gap-course-list">{suggestions.map(item => <button type="button" key={item.id} data-kind={item.kind}
        onClick={() => { if (onCourse(item)) onClose(); else setError('강좌를 저장하지 못했어요.') }}>
        <strong>{item.label}</strong><span>{formatMinutes(item.start!)}–{formatMinutes(item.end!)}</span></button>)}</div>
    </section>}
    <form className="gap-form" data-testid="gap-entry-form" onSubmit={submit}>
      <label>이름<input name="label" maxLength={80} required value={label} readOnly={!editable} placeholder="예: 도서관 읽기, 태권도" autoComplete="off" onChange={(event) => setLabel(event.target.value)} /></label>
      <div className="gap-form-row">
        <label>시작<input aria-label="시작" type="time" value={start} disabled={afterSchool} onChange={(event) => setStart(event.target.value)} /></label>
        <label>끝<input aria-label="끝" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
      </div>
      {entry?.kind === 'care' && <label>시작 기준<select value={afterSchool ? 'dismissal' : 'time'} onChange={(event) => setAfterSchool(event.target.value === 'dismissal')}><option value="dismissal">하교 후</option><option value="time">직접 정한 시각</option></select></label>}
      <fieldset><legend>종류</legend><div className="gap-chips">{TYPES.map(value => <button type="button" key={value} data-kind={value} disabled={!editable}
        aria-pressed={(academy ? 'academy' : kind) === value} onClick={() => { setAcademy(value === 'academy'); setKind(value === 'academy' ? 'personal' : value) }}>
        <i aria-hidden="true" />{TYPE_NAMES[value]}</button>)}</div></fieldset>
      {entry && <fieldset><legend>상태</legend><div className="gap-chips">{SHOWN_STATUS.filter(value => value !== 'planned' || participation === 'planned').map(value => <button type="button" key={value}
        aria-pressed={participation === value} onClick={() => setParticipation(value)}>{STATUS[value]}</button>)}</div></fieldset>}
      <fieldset><legend>요일 <small>· 같은 시간에 반복</small></legend><div className="gap-choices">{WEEKDAYS.map(day => <button type="button" key={day} disabled={!available.includes(day)}
        aria-pressed={weekdays.includes(day)} aria-label={DAY_NAMES[day - 1] + '요일'} onClick={() => setWeekdays(list => list.includes(day) ? list.filter(item => item !== day) : [...list, day].sort())}>{DAY_NAMES[day - 1]}</button>)}</div></fieldset>
      {reasons.length > 0 && <div className="gap-explanation"><strong>! 학교에 확인해 주세요</strong><ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
      {error && <p role="alert">{error}</p>}
      <div className="gap-actions">
        {entry && <button type="button" onClick={() => { if (onRemove(false)) onClose(); else setError('빼지 못했어요. 다시 열어 주세요.') }}>이 요일에서 빼기</button>}
        <button type="submit" className="gap-primary">{entry ? '저장' : '넣기'}</button>
      </div>
      {entry && entry.weekdays.length > 1 && <button type="button" onClick={() => { if (onRemove(true)) onClose(); else setError('빼지 못했어요. 다시 열어 주세요.') }}>모든 요일에서 빼기</button>}
    </form>
  </GapDialog>
}
