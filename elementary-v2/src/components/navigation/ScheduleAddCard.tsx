import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'
import type { CalendarChange, CalendarRange } from '../../utils/schedule/editing'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import MyAfterschoolPicker, { type EntryDraft } from './MyAfterschoolPicker'
import MyScheduleAcademyPicker from './MyScheduleAcademyPicker'
import { CalendarEntryForm } from './CalendarEntryDialog'
import { followLink } from '../content/contentLinks'
import { FRONTYARD_ENABLED } from '../../utils/features'
import { frontyardPath } from '../../utils/urlState'

export default function ScheduleAddCard({ schoolId, entries, range, onAdd, onRemove, onToggleDay, onSave, onChangeDay, onClose, onNavigate }: {
  schoolId: string; entries: ScheduleEntry[]; range: CalendarRange
  onNavigate?: (path: string) => void
  onAdd: (entry: ScheduleEntry) => boolean; onRemove: (id: string) => boolean
  onToggleDay: (entry: ScheduleEntry, weekday: Weekday) => boolean
  onSave: (change: CalendarChange) => ScheduleEntry | null
  onChangeDay: (weekday: Weekday) => void; onClose: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [mode, setMode] = useState<'school' | 'academy' | 'manual'>('school')
  const [academy, setAcademy] = useState('')
  const [academyKey, setAcademyKey] = useState<string | undefined>()
  const [feedback, setFeedback] = useState('')
  const [manualDraft, setManualDraft] = useState<EntryDraft | null>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'nearest' }) }, [])
  const save = (change: CalendarChange) => {
    if (mode === 'manual' && manualDraft) {
      const entry: ScheduleEntry = { id: manualDraft.id, label: change.label, kind: change.kind, weekdays: [change.weekday],
        start: change.start, end: change.end, evidence: 'estimated', participation: 'planned', transitionIn: 'unknown', term: 'semester' }
      if (!onAdd(entry)) return null
      onClose(); return entry
    }
    const saved = onSave(mode === 'academy' && academyKey ? { ...change, providerKey: academyKey } : change); if (saved) onClose(); return saved
  }
  return <section className="my-add-card" aria-label={`${'월화수목금'[range.weekday - 1]}요일 일정 선택 카드`} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
  }}>
    <div className="my-add-card__heading"><div><span>{formatMinutes(range.start)}–{formatMinutes(range.end)} · 선택한 구간</span><h4 ref={heading} tabIndex={-1}>{'월화수목금'[range.weekday - 1]}요일에 무엇을 할까요?</h4></div>
      <button type="button" className="my-button" aria-label="일정 선택 카드 닫기" onClick={onClose}><X size={18} aria-hidden="true" /></button></div>
    <label className="my-field">선택 요일<select value={range.weekday} onChange={(event) => onChangeDay(Number(event.target.value) as Weekday)}>{[1,2,3,4,5].map((day) => <option key={day} value={day}>{'월화수목금'[day - 1]}요일</option>)}</select></label>
    {onNavigate && FRONTYARD_ENABLED && <FrontyardLinks schoolId={schoolId} range={range} onNavigate={onNavigate} />}
    <div className="my-add-card__tabs" role="group" aria-label="추가할 일정 종류">
      <button type="button" aria-pressed={mode === 'school'} onClick={() => setMode('school')}>방과후·돌봄</button>
      <button type="button" aria-pressed={mode === 'academy'} onClick={() => setMode('academy')}>외부 학원</button>
      <button type="button" aria-pressed={mode === 'manual'} onClick={() => { setManualDraft(null); setMode('manual') }}>직접 입력</button>
    </div>
    {mode === 'school' && <MyAfterschoolPicker schoolId={schoolId} entries={entries} onAdd={onAdd} onRemove={onRemove}
      weekday={range.weekday} onToggleDay={(entry, weekday) => { const saved = onToggleDay(entry, weekday); setFeedback(saved ? '선택한 요일의 시간표에 반영했어요. 다른 과목·돌봄도 함께 선택할 수 있어요.' : '저장하지 못했어요. 다시 확인해 주세요.'); return saved }}
      onDraft={(draft) => { setManualDraft(draft); setMode('manual') }} />}
    {mode === 'academy' && <>
      <MyScheduleAcademyPicker schoolId={schoolId} onChoose={(label, key) => { setAcademy(label); setAcademyKey(key) }} />
      {academy && <div className="my-add-card__academy-time"><h5>{academy}</h5><p className="my-help">학원을 골랐어요. 확인한 수업 시간을 직접 입력해 주세요.</p><CalendarEntryForm key={`${academy}-${range.weekday}`} unknownTimes draft={{ ...range, label: academy, kind: 'personal' }} onSave={save} onClose={onClose} /></div>}
    </>}
    {mode === 'manual' && <CalendarEntryForm key={`${range.weekday}-${manualDraft?.id ?? ''}`} draft={{ ...range, label: manualDraft?.label ?? '', kind: manualDraft?.kind ?? (manualDraft ? 'afterschool' : 'personal') }}
      initialTimes={manualDraft ? { start: manualDraft.start, end: manualDraft.end } : undefined} planningSelection={Boolean(manualDraft)} onSave={save} onClose={onClose} />}
    <p className="my-help" role="status">{feedback}</p>
  </section>
}

/**
 * 빈 시간에서 학교앞마당으로(인수인계서 5절). 둘러보기는 그 요일·시간과 겹치는 글만 보이고,
 * 알리기는 [찾아요] 쓰기를 같은 시간으로 채워 연다. 시간표는 건드리지 않는다.
 */
function FrontyardLinks({ schoolId, range, onNavigate }: { schoolId: string; range: CalendarRange; onNavigate: (path: string) => void }) {
  const slot = { weekday: range.weekday, start: formatMinutes(range.start), end: formatMinutes(range.end) }
  const browse = frontyardPath(schoolId, slot)
  const ask = frontyardPath(schoolId, slot, { write: true })
  return <div className="my-add-card__frontyard" aria-label="학교앞마당에서 찾기">
    <p className="my-help">이 시간에 맞는 수업·돌봄을 학교앞마당에서 찾거나 알릴 수 있어요.</p>
    <a className="my-button" href={browse} onClick={(event) => followLink(event, browse, onNavigate)}>주변 활동 둘러보기</a>
    <a className="my-button" href={ask} onClick={(event) => followLink(event, ask, onNavigate)}>원하는 활동 알리기</a>
  </div>
}
