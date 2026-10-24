import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DayPlan } from '../../utils/schedule/engine'
import { careResumptions, scheduleEntryHeading, scheduleEntrySubject } from '../../utils/schedule/calendar'
import { dayTimelineItems, type DayTimelineItem } from '../../utils/schedule/dayTimeline'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import type { ScheduleEntry } from '../../utils/schedule/types'
import ScheduleSubjectIcon from './ScheduleSubjectIcon'

const timeLabel = ({ entry, start, end, section }: DayTimelineItem) => section === 'school'
  ? `하교 ${end === null ? '시각 미확인' : `${formatMinutes(end)} (예상)`}`
  : entry.startsAfterSchool && start === null && end !== null ? `하교 후–${formatMinutes(end)}${entry.timeAssumption ? ' · 기본 가정' : ''} · 시작 확인 필요`
  : start === null || end === null ? '시간 확인 필요' : `${formatMinutes(start)}–${formatMinutes(end)}${entry.timeAssumption ? ' · 기본 가정' : ''}${entry.participation === 'considering' ? ' · 후보' : ''}`

export default function MyScheduleDay({ day, entries, selectedId, onSelect, onCreate, composer }: {
  day: DayPlan
  entries: ScheduleEntry[]
  selectedId?: string
  onSelect: (id: string) => void
  onCreate: () => void
  composer?: ReactNode
}) {
  const items = dayTimelineItems(day, entries)
  const conflicts = day.overlaps.filter((overlap) => overlap.type === 'conflict')
  const connections = day.unplaced.some(({ entry }) => entry.kind === 'afterschool') ? [] : careResumptions(day.blocks)
  return <div className="my-agenda" id={`my-agenda-day-${day.weekday}`} role="region" aria-label={`${'월화수목금'[day.weekday - 1]}요일 하루 시간표`}>
    <ol className="my-agenda__list">
      {items.map((item) => <li className={`my-agenda__row my-agenda__row--${item.section}`} key={item.entry.id} data-entry-id={item.entry.id} data-section={item.section}>
        <div className="my-agenda__time" aria-hidden="true">
          <b>{item.section === 'school' ? '수업' : item.start === null ? item.section === 'morning' ? '등교 전' : '미정' : formatMinutes(item.start)}</b>
          <span>{item.section === 'school' ? '축약' : item.end === null ? '확인 필요' : formatMinutes(item.end)}</span>
        </div>
        <div className="my-agenda__track" aria-hidden="true"><span /></div>
        <button type="button" className={`my-agenda__card my-agenda__card--${item.entry.kind}${item.section === 'school' ? ' my-agenda__card--school-fold' : ''}`}
          data-subject={scheduleEntrySubject(item.entry)} data-kind={item.entry.label.startsWith('맞춤형') ? 'custom' : item.entry.kind}
          aria-label={`${scheduleEntryHeading(item.entry)} · ${timeLabel(item)}`} aria-pressed={selectedId === item.entry.id}
          title={`${scheduleEntryHeading(item.entry)} · ${timeLabel(item)}`} onClick={() => onSelect(item.entry.id)}>
          <b><span className="my-entry-title">{scheduleEntryHeading(item.entry)}</span><ScheduleSubjectIcon entry={item.entry} /></b>
          <span className="my-agenda__caption">{timeLabel(item)}</span>
        </button>
      </li>)}
    </ol>
    {!items.length && <div className="my-agenda__empty"><p>아직 선택한 일정이 없어요</p><span>과목·돌봄을 선택하거나 일정을 추가해 보세요.</span></div>}
    {composer ?? <button className="my-agenda__add" type="button" onClick={onCreate}><Plus size={16} aria-hidden="true" /> 일정 추가 · 과목 선택하기</button>}
    {(conflicts.length > 0 || day.overlaps.some((overlap) => overlap.type === 'care_afterschool')) && <div className="my-agenda__notes">
      {conflicts.length > 0 && <p className="my-warning">시간 겹침 {conflicts.length}건 · 일정 카드를 눌러 시간을 확인하세요.</p>}
      {day.overlaps.some((overlap) => overlap.type === 'care_afterschool') && <>
        <p>돌봄과 방과후/맞춤형을 함께 선택했어요.</p>
        {connections.map(({ care, after, from, to }) => <p key={care.entry.id}>{after.entry.label} 종료 → {care.entry.label} {formatMinutes(from)}–{formatMinutes(to)}</p>)}
        <small>이동·돌봄 복귀 조건은 학교에 확인해 주세요.</small>
      </>}
    </div>}
    {items.length > 0 && <p className="my-agenda__footnote">카드를 누르면 시간·요일을 바꿀 수 있어요.</p>}
  </div>
}
