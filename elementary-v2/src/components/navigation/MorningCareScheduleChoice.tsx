import { useState } from 'react'
import type { MorningCareInfo } from '../../types/morningCare'
import { morningCareEntry, morningCareEntryId } from '../../utils/schedule/morningCare'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'
import { morningCareStatusLabel } from '../../utils/morningCare'

const DAYS: Weekday[] = [1, 2, 3, 4, 5]
export default function MorningCareScheduleChoice({ schoolId, info, entries, onAdd, onRemove }: {
  schoolId: string; info: MorningCareInfo; entries: ScheduleEntry[]
  onAdd: (entry: ScheduleEntry) => boolean; onRemove: (id: string) => boolean
}) {
  const existing = entries.find((e) => e.id === morningCareEntryId(schoolId))
  const [days, setDays] = useState<Weekday[]>(existing?.weekdays ?? info.weekdays ?? [])
  const entry = morningCareEntry(schoolId, info, days)
  const available = morningCareEntry(schoolId, info, [1]) !== null
  const selected = existing && !['cancelled', 'rejected', 'considering'].includes(existing.participation)
  return <div className="my-entry-form" data-testid="morning-care-choice">
    <h4>아침돌봄 · {morningCareStatusLabel[info.status]}</h4>
    <p className="my-help">{info.startTime ?? '시작 미확인'} ~ {info.endTime ?? '종료 미확인'} · {info.schoolYear ? `${info.schoolYear}학년도` : '학년도 미확인'} · 대상 {info.grades ?? '미확인'}</p>
    <p className="my-help">출처: {info.source ?? '미확인'}. 이용 요일·대상학년·신청 조건은 학교에 확인해 주세요. 선택은 참여 확정과 별개예요.</p>
    {available ? <>
      <fieldset className="my-actions"><legend>아침돌봄 이용 요일 선택</legend>
        {DAYS.map((day) => <label key={day} className="inline-flex min-h-11 items-center gap-1 px-2"><input type="checkbox" checked={days.includes(day)} onChange={(event) => setDays((current) => event.target.checked ? [...current, day].sort() : current.filter((d) => d !== day))} />{' '}{'월화수목금'[day - 1]}</label>)}
      </fieldset>
      <button type="button" className="my-button" disabled={!entry} onClick={() => {
        if (entry) onAdd({ ...entry, ...(existing ? { participation: selected ? existing.participation : 'planned', userOverride: existing.userOverride, start: existing.start, end: existing.end } : {}) })
      }}>{selected ? '아침돌봄 요일 반영' : '아침돌봄 시간표에 넣기'}</button>
    </> : <p className="my-help">아침돌봄 시간·운영 여부를 확인한 뒤 일정을 추가해 주세요. 미확인은 미운영을 뜻하지 않아요.</p>}
    {existing && <button type="button" className="my-button" onClick={() => onRemove(existing.id)}>아침돌봄 선택 해제</button>}
  </div>
}
