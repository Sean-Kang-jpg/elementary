import type { DayPlan } from '../../utils/schedule/engine'
import { layoutCalendarBlocks, scheduleEntryHeading } from '../../utils/schedule/calendar'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import { isMorningCalendarCare, type MorningCalendarView } from '../../utils/schedule/morningCalendar'
import type { ScheduleEntry } from '../../utils/schedule/types'
import ScheduleSubjectIcon from './ScheduleSubjectIcon'

export default function MorningCalendarBand({ view, day, entries, onSelect }: {
  view: MorningCalendarView; day: DayPlan; entries: ScheduleEntry[]; onSelect: (id: string) => void
}) {
  const blocks = [...day.blocks, ...day.candidates].filter(({ entry }) => entry.kind !== 'school')
  const unknown = entries.filter((entry) => isMorningCalendarCare(entry) && !blocks.some((block) => block.entry.id === entry.id))
  const school = entries.find((entry) => entry.kind === 'school')
  const calendar = view.start === null || view.end === null ? [] : layoutCalendarBlocks(blocks, { start: view.start, end: view.end })
  return <>
    {view.hasUnknown && <div className="my-morning__unknown">
      {unknown.map((entry) => <button type="button" className="my-morning__unknown-card" key={entry.id} onClick={() => onSelect(entry.id)}><b>{entry.label}</b><span>시간 확인 필요</span></button>)}
    </div>}
    {view.height > 0 && <div className="my-morning__timeline" style={{ height: view.height }} aria-label="등교 전 일정">
      {view.hours.map((hour) => <div className="my-week__hour-line" key={hour} style={{ top: `${(hour * 60 - view.start!) * 1.2}px` }} aria-hidden="true" />)}
      {calendar.map(({ block, from, to, lane, lanes }) => <button type="button" key={block.entry.id}
        className={`my-week__entry my-week__entry--${block.entry.kind}${block.entry.participation === 'considering' ? ' my-week__candidate' : ''}`}
        style={{ top: (from - view.start!) * 1.2, height: (to - from) * 1.2, left: `calc(${lane / lanes * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
        data-band="morning" data-start={block.start} data-end={block.end}
        aria-label={`${'월화수목금'[day.weekday - 1]}요일 ${block.entry.label} ${formatMinutes(block.start)}–${formatMinutes(block.end)}${block.entry.timeAssumption ? ' · 기본 가정' : ''}`} onClick={() => onSelect(block.entry.id)}>
        <b><ScheduleSubjectIcon entry={block.entry} /><span className="my-entry-title">{scheduleEntryHeading(block.entry)}</span></b><span className="my-week__time">{formatMinutes(block.start)}–{formatMinutes(block.end)}{block.entry.timeAssumption && ' · 기본 가정'}</span>
      </button>)}
      {!calendar.length && <span className="my-week__empty">선택한 아침 일정 없음</span>}
    </div>}
    <div className="my-school-fold" aria-label="정규수업 구간 축약">
      {school ? <button type="button" className="my-school-fold__card" onClick={() => onSelect(school.id)}>
        <b><ScheduleSubjectIcon entry={school} /><span className="my-entry-title">{scheduleEntryHeading(school)}</span></b><span>하교 {day.dismissal.at === null ? '시각 미확인' : `${formatMinutes(day.dismissal.at)} (예상)`}</span>
      </button> : <span className="my-school-fold__empty">정규수업 자료 미확인</span>}
    </div>
  </>
}
