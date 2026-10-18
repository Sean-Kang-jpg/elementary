import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'
import type { CalendarChange, CalendarRange } from '../../utils/schedule/editing'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import MyAfterschoolPicker from './MyAfterschoolPicker'
import MyScheduleAcademyPicker from './MyScheduleAcademyPicker'
import { CalendarEntryForm } from './CalendarEntryDialog'

export default function ScheduleAddCard({ schoolId, entries, range, onAdd, onRemove, onToggleDay, onSave, onChangeDay, onClose }: {
  schoolId: string; entries: ScheduleEntry[]; range: CalendarRange
  onAdd: (entry: ScheduleEntry) => boolean; onRemove: (id: string) => boolean
  onToggleDay: (entry: ScheduleEntry, weekday: Weekday) => boolean
  onSave: (change: CalendarChange) => ScheduleEntry | null
  onChangeDay: (weekday: Weekday) => void; onClose: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [mode, setMode] = useState<'school' | 'academy' | 'manual'>('school')
  const [academy, setAcademy] = useState('')
  const [feedback, setFeedback] = useState('')
  useEffect(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'nearest' }) }, [])
  const save = (change: CalendarChange) => { const saved = onSave(change); if (saved) onClose(); return saved }
  return <section className="my-add-card" aria-label={`${'월화수목금'[range.weekday - 1]}요일 일정 선택 카드`} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
  }}>
    <div className="my-add-card__heading"><div><span>{formatMinutes(range.start)}–{formatMinutes(range.end)} · 선택한 구간</span><h4 ref={heading} tabIndex={-1}>{'월화수목금'[range.weekday - 1]}요일에 무엇을 할까요?</h4></div>
      <button type="button" className="my-button" aria-label="일정 선택 카드 닫기" onClick={onClose}><X size={18} aria-hidden="true" /></button></div>
    <label className="my-field">선택 요일<select value={range.weekday} onChange={(event) => onChangeDay(Number(event.target.value) as Weekday)}>{[1,2,3,4,5].map((day) => <option key={day} value={day}>{'월화수목금'[day - 1]}요일</option>)}</select></label>
    <div className="my-add-card__tabs" role="group" aria-label="추가할 일정 종류">
      <button type="button" aria-pressed={mode === 'school'} onClick={() => setMode('school')}>방과후·돌봄</button>
      <button type="button" aria-pressed={mode === 'academy'} onClick={() => setMode('academy')}>외부 학원</button>
      <button type="button" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>직접 입력</button>
    </div>
    {mode === 'school' && <MyAfterschoolPicker schoolId={schoolId} entries={entries} onAdd={onAdd} onRemove={onRemove}
      weekday={range.weekday} onToggleDay={(entry, weekday) => { const saved = onToggleDay(entry, weekday); setFeedback(saved ? '선택한 요일의 시간표에 반영했어요. 다른 과목·돌봄도 함께 선택할 수 있어요.' : '저장하지 못했어요. 다시 확인해 주세요.'); return saved }}
      onDraft={() => setMode('manual')} />}
    {mode === 'academy' && <>
      <MyScheduleAcademyPicker schoolId={schoolId} onChoose={(label) => setAcademy(label)} />
      {academy && <div className="my-add-card__academy-time"><h5>{academy}</h5><p className="my-help">학원을 골랐어요. 확인한 수업 시간을 직접 입력해 주세요.</p><CalendarEntryForm key={`${academy}-${range.weekday}`} unknownTimes draft={{ ...range, label: academy, kind: 'personal' }} onSave={save} onClose={onClose} /></div>}
    </>}
    {mode === 'manual' && <CalendarEntryForm key={range.weekday} draft={{ ...range, label: '', kind: 'personal' }} onSave={save} onClose={onClose} />}
    <p className="my-help" role="status">{feedback}</p>
  </section>
}
