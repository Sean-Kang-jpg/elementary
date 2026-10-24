import { useState } from 'react'
import type { MorningCareInfo } from '../../types/morningCare'
import { morningCareEntry, morningCareEntryId } from '../../utils/schedule/morningCare'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'
import { morningCareStatusLabel } from '../../utils/morningCare'
import { isProgramDaySelected } from '../../utils/schedule/programSelection'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import RepeatDays from './RepeatDays'

const DAYS: Weekday[] = [1, 2, 3, 4, 5]
export default function MorningCareScheduleChoice({ schoolId, info, entries, onAdd, onRemove, weekday, onToggleDay, onRepeat, onRemoveDay }: {
  schoolId: string; info: MorningCareInfo; entries: ScheduleEntry[]
  onAdd: (entry: ScheduleEntry) => boolean; onRemove: (id: string) => boolean
  weekday?: Weekday; onToggleDay?: (entry: ScheduleEntry, weekday: Weekday) => boolean
  onRepeat?: (id: string, from: Weekday, targets: Weekday[]) => boolean
  onRemoveDay?: (id: string, weekday: Weekday) => boolean
}) {
  const existing = entries.find((e) => e.id === morningCareEntryId(schoolId))
  const [days, setDays] = useState<Weekday[]>(existing?.weekdays ?? info.weekdays ?? [])
  const entry = morningCareEntry(schoolId, info, weekday ? [weekday] : days)
  const available = morningCareEntry(schoolId, info, [1]) !== null
  const selected = weekday ? isProgramDaySelected(existing, weekday) : existing && !['cancelled', 'rejected', 'considering'].includes(existing.participation)
  if (weekday) return available && entry ? <div className="my-course-section" data-testid="morning-care-choice">
    <button type="button" className="my-course-choice my-course-choice--care" aria-pressed={Boolean(selected)} onClick={() => onToggleDay?.(entry, weekday)}>
      <span className="my-course-choice__lines"><b>아침돌봄 · {'월화수목금'[weekday - 1]}요일</b><span>{formatMinutes(entry.start!)}–{formatMinutes(entry.end!)}{entry.timeAssumption && ' · 기본 가정'}</span></span><i aria-hidden="true">{selected ? '✓' : '+'}</i>
    </button>{selected && onRepeat && onRemoveDay && <RepeatDays entry={existing} weekday={weekday} onRepeat={onRepeat} onRemoveDay={onRemoveDay} />}<small>{entry.timeAssumption && '운영시간 미확인 · 계획용 기본 시간이에요(넣은 뒤 카드를 눌러 바꿀 수 있어요). '}대상·신청 조건·이용 요일은 학교 확인 필요</small>
  </div> : null
  return <div className="my-entry-form" data-testid="morning-care-choice">
    <h4>아침돌봄 · {morningCareStatusLabel[info.status]}</h4>
    <p className="my-help">{info.startTime ?? '시작 미확인'} ~ {info.endTime ?? '종료 미확인'} · {info.schoolYear ? `${info.schoolYear}학년도` : '학년도 미확인'} · 대상 {info.grades ?? '미확인'}</p>
    <p className="my-help">출처: {info.source ?? '미확인'}. 이용 요일·대상학년·신청 조건은 학교에 확인해 주세요. 선택은 참여 확정과 별개예요.</p>
    {available && morningCareEntry(schoolId, info, [1])?.timeAssumption && <p className="my-help">08:00–09:00 기본 가정으로 배치해요. 학교의 실제 운영시간은 미확인이에요.</p>}
    {available ? <>
      {!weekday && <fieldset className="my-actions"><legend>아침돌봄 이용 요일 선택</legend>
        {DAYS.map((day) => <label key={day} className="inline-flex min-h-11 items-center gap-1 px-2"><input type="checkbox" checked={days.includes(day)} onChange={(event) => setDays((current) => event.target.checked ? [...current, day].sort() : current.filter((d) => d !== day))} />{' '}{'월화수목금'[day - 1]}</label>)}
      </fieldset>}
      <button type="button" className="my-button" disabled={!entry} onClick={() => {
        if (entry && weekday && onToggleDay) onToggleDay(entry, weekday)
        else if (entry) onAdd({ ...entry, ...(existing ? { participation: selected ? existing!.participation : 'planned', userOverride: existing.userOverride, start: existing.start, end: existing.end } : {}) })
      }}>{weekday ? `아침돌봄 ${'월화수목금'[weekday - 1]}요일 ${selected ? '선택 해제' : '추가'}` : selected ? '아침돌봄 요일 반영' : '아침돌봄 시간표에 넣기'}</button>
    </> : <p className="my-help">아침돌봄 시간·운영 여부를 확인한 뒤 일정을 추가해 주세요. 미확인은 미운영을 뜻하지 않아요.</p>}
    {existing && !weekday && <button type="button" className="my-button" onClick={() => onRemove(existing.id)}>아침돌봄 선택 해제</button>}
  </div>
}
