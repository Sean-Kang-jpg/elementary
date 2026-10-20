import { useEffect, useId, useRef, useState } from 'react'
import { formatMinutes, toMinutes } from '../../utils/schedule/fromSchoolData'
import type { CalendarChange } from '../../utils/schedule/editing'
import type { EntryKind, ScheduleEntry, Weekday } from '../../utils/schedule/types'

const DAYS = ['월', '화', '수', '목', '금']
export default function CalendarEntryDialog({ draft, onSave, onClose }: {
  draft: CalendarChange
  onSave: (change: CalendarChange) => ScheduleEntry | null
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => { if (node?.open) node.close() }
  }, [])
  return <dialog className="my-calendar-dialog" ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }}>
    <h3 id={titleId}>{draft.original ? '일정 수정' : '일정 추가'}</h3>
    <CalendarEntryForm draft={draft} onSave={onSave} onClose={onClose} />
  </dialog>
}

export function CalendarEntryForm({ draft, onSave, onClose, unknownTimes = false, initialTimes, planningSelection = false }: {
  draft: CalendarChange
  onSave: (change: CalendarChange) => ScheduleEntry | null
  onClose: () => void
  unknownTimes?: boolean
  initialTimes?: { start: string; end: string }
  planningSelection?: boolean
}) {
  const [label, setLabel] = useState(draft.label)
  const [kind, setKind] = useState(draft.kind)
  const [weekday, setWeekday] = useState(draft.weekday)
  const [start, setStart] = useState(initialTimes?.start ?? (unknownTimes ? '' : formatMinutes(draft.start)))
  const [end, setEnd] = useState(initialTimes?.end ?? (unknownTimes ? '' : formatMinutes(draft.end)))
  const [error, setError] = useState('')
  return <form className="my-calendar-form" onSubmit={(event) => {
      event.preventDefault()
      const from = toMinutes(start), to = toMinutes(end)
      if (!label.trim() || from === null || to === null || from >= to) { setError('일정 이름과 시작·종료 시간을 확인해 주세요.'); return }
      if (onSave({ ...draft, label, kind, weekday, start: from, end: to })) onClose()
      else setError('변경 내용을 저장하지 못했어요. 다른 탭에서 바뀐 일정은 다시 열어 주세요.')
    }}>
      <label className="my-field">일정 이름<input autoFocus value={label} maxLength={80} required placeholder="예: 피아노, 도서관" onChange={(event) => setLabel(event.target.value)} /></label>
      <div className="my-time-fields">
        <label className="my-field">유형<select value={kind} onChange={(event) => setKind(event.target.value as Exclude<EntryKind, 'school'>)}>
          <option value="personal">개인 일정</option><option value="afterschool">방과후</option><option value="care">돌봄</option>
        </select></label>
        <label className="my-field">요일<select value={weekday} onChange={(event) => setWeekday(Number(event.target.value) as Weekday)}>{DAYS.map((day, index) => <option key={day} value={index + 1}>{day}요일</option>)}</select></label>
      </div>
      <div className="my-time-fields">
        <label className="my-field">시작<input type="time" step={300} required value={start} onChange={(event) => setStart(event.target.value)} /></label>
        <label className="my-field">종료<input type="time" step={300} required value={end} onChange={(event) => setEnd(event.target.value)} /></label>
      </div>
      <p className="my-help">{draft.original ? '선택한 요일의 일정만 수정해요. 다른 요일과 참여 상태는 유지돼요.' : planningSelection ? '입력한 시간으로 이 요일의 계획에 포함해요. 신청·참여 확정과는 별개예요.' : '추가한 일정은 후보로 저장돼요. 참여 상태는 일정 관리에서 바꿀 수 있어요.'}</p>
      <p className="my-warning" role="alert">{error}</p>
      <div className="my-actions"><button type="submit" className="my-button my-button--primary">저장</button><button type="button" className="my-button" onClick={onClose}>취소</button></div>
    </form>
}
