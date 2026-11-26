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

export default function GapEntrySheet({ range, entry, suggestions, reasons, onClose, onSave, onCourse, onRemove }: {
  range: CalendarRange
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
  const [showCourses, setShowCourses] = useState(false)
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
    const time: DayTime | null = !noTimes && from !== null && to !== null && (from !== initial.time?.start || to !== initial.time?.end || weekdays.some(day => !entry?.weekdays.includes(day))) ? { start: from, end: to } : null
    if (onSave({ label, kind, weekdays, participation, time, original: entry, activityType: academy ? 'academy' : undefined })) onClose()
    else setError('저장하지 못했어요. 다른 탭에서 수정했다면 다시 열어 주세요.')
  }
  return <GapDialog title={entry ? '일정 수정' : '일정 추가'} hint={DAY_NAMES[range.weekday - 1] + '요일 · ' + formatMinutes(range.start)} onClose={onClose}>
    {suggestions.length > 0 && <div className="gap-course">
      <button type="button" data-testid="gap-courses" aria-expanded={showCourses} onClick={() => setShowCourses(!showCourses)}>이 시간에 맞는 학교 강좌 {suggestions.length}</button>
      {showCourses && suggestions.map(item => <button type="button" key={item.id} onClick={() => { if (onCourse(item)) onClose(); else setError('강좌를 저장하지 못했어요.') }}>{item.label} · {formatMinutes(item.start!)}–{formatMinutes(item.end!)}</button>)}
    </div>}
    <form className="gap-form" data-testid="gap-entry-form" onSubmit={submit}>
      <label>일정 이름<input name="label" maxLength={80} required value={label} readOnly={!editable} onChange={(event) => setLabel(event.target.value)} /></label>
      <div className="gap-form-row">
        <label>시작<input aria-label="시작" type="time" value={start} disabled={afterSchool} onChange={(event) => setStart(event.target.value)} /></label>
        <label>끝<input aria-label="끝" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
      </div>
      {entry?.kind === 'care' && <label>시작 기준<select value={afterSchool ? 'dismissal' : 'time'} onChange={(event) => setAfterSchool(event.target.value === 'dismissal')}><option value="dismissal">하교 후</option><option value="time">직접 정한 시각</option></select></label>}
      <div className="gap-form-row">
        <label>유형<select value={academy ? 'academy' : kind} disabled={!editable} onChange={(event) => {
          const value = event.target.value as GapEdit['kind'] | 'academy'
          setAcademy(value === 'academy'); setKind(value === 'academy' ? 'personal' : value)
        }}><option value="personal">개인</option><option value="care">돌봄</option><option value="afterschool">방과후</option><option value="academy">학원</option></select></label>
        {entry && <label>참여 상태<select value={participation} onChange={(event) => setParticipation(event.target.value as ParticipationStatus)}>
          {Object.entries(STATUS).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
        </select></label>}
      </div>
      <fieldset><legend>같은 시간으로 넣을 요일</legend><div className="gap-choices">{WEEKDAYS.map(day => <button type="button" key={day} disabled={!available.includes(day)}
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
