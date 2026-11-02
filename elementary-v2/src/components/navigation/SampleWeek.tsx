import { computeWeek, type DayPlan } from '../../utils/schedule/engine'
import { CALENDAR_END, CALENDAR_HOURS, CALENDAR_START, layoutCalendarBlocks, scheduleEntryHeading, scheduleKindLabel } from '../../utils/schedule/calendar'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'
import ScheduleSubjectIcon from './ScheduleSubjectIcon'

const DAYS = ['월', '화', '수', '목', '금']
const h = (hour: number, minute = 0) => hour * 60 + minute
const percent = (minutes: number) => (minutes - CALENDAR_START) / (CALENDAR_END - CALENDAR_START) * 100

const school = (weekday: Weekday, end: number, periods: number): ScheduleEntry => ({
  id: `sample-school-${weekday}`, kind: 'school', label: `정규수업 ${periods}교시`, weekdays: [weekday],
  start: null, end, evidence: 'estimated', participation: 'confirmed',
})

/**
 * 예시 한 주. 어느 학교의 자료도 아니고, 초1 오후가 대개 이렇게 짜인다는 모양만 보여 준다 —
 * 4·5교시 하교, 하교 후 오후돌봄, 그 사이 방과후 강좌, 돌봄 뒤 학원.
 */
const SAMPLE_ENTRIES: ScheduleEntry[] = [
  school(1, h(12, 50), 4), school(2, h(13, 40), 5), school(3, h(12, 50), 4), school(4, h(13, 40), 5), school(5, h(12, 50), 4),
  // 돌봄은 방과후가 끝난 뒤로 이어 그린다 — 다섯 요일을 한 화면에 넣으면 겹친 칸을 나란히 둘 폭이 없다.
  { id: 'sample-care-fri', kind: 'care', label: '오후돌봄', weekdays: [5], start: null, end: h(17), startsAfterSchool: true, evidence: 'school-plan', participation: 'planned' },
  { id: 'sample-care-mw', kind: 'care', label: '오후돌봄', weekdays: [1, 3], start: h(14, 20), end: h(17), evidence: 'school-plan', participation: 'planned' },
  { id: 'sample-care-tt', kind: 'care', label: '오후돌봄', weekdays: [2, 4], start: h(15, 20), end: h(17), evidence: 'school-plan', participation: 'planned' },
  { id: 'sample-art', kind: 'afterschool', label: '방과후 창의미술', weekdays: [1, 3], start: h(13, 0), end: h(14, 20), evidence: 'school-plan', participation: 'planned' },
  { id: 'sample-jump', kind: 'afterschool', label: '방과후 줄넘기', weekdays: [2], start: h(14, 0), end: h(15, 20), evidence: 'school-plan', participation: 'planned' },
  { id: 'sample-reading', kind: 'afterschool', label: '방과후 독서논술', weekdays: [4], start: h(14, 0), end: h(15, 20), evidence: 'school-plan', participation: 'planned' },
  { id: 'sample-taekwondo', kind: 'personal', label: '태권도', weekdays: [1, 3, 5], start: h(17, 10), end: h(18), evidence: 'confirmed', participation: 'planned' },
  { id: 'sample-math', kind: 'personal', label: '수학 학원', weekdays: [2, 4], start: h(17, 10), end: h(18), evidence: 'confirmed', participation: 'planned' },
]

/** 좁은 화면은 시작 시각만 남긴다(끝 시각은 다음 칸이 말해 준다). 정규수업은 하교 시각. */
const CompactTime = ({ entry, day, start, end }: { entry: ScheduleEntry; day: DayPlan; start: number; end: number }) =>
  entry.kind === 'school'
    ? <span className="my-week__time">~{formatMinutes(day.dismissal.at ?? end)}</span>
    : <span className="my-week__time">{formatMinutes(start)}<span className="sample-week__end">–{formatMinutes(end)}</span></span>

/** 좁은 칸에 들어가는 이름. 종류는 색과 아이콘이 말해 준다. */
const shortTitle = (entry: ScheduleEntry) =>
  entry.kind === 'school' ? '수업' : entry.kind === 'care' ? '돌봄' : entry.label.replace(/^방과후\s*/, '')

const LEGEND = [
  { kind: 'school', label: '정규수업' }, { kind: 'afterschool', label: '방과후' },
  { kind: 'care', label: '돌봄' }, { kind: 'personal', label: '학원·개인' },
] as const

/**
 * 우리 아이 한 주의 예시(2026-11-03 사용자 요청). 실제 '주간 편집'과 같은 엔진·같은 칸 모양으로 그리되, 누르거나
 * 끌어 옮기는 동작은 없다. 학교를 고르기 전 우리집 일정과 배움·돌봄에서 무엇을 만들게 되는지 보여 준다.
 */
export default function SampleWeek({ caption }: { caption?: string }) {
  const days = computeWeek(SAMPLE_ENTRIES, { from: 'dismissal', to: CALENDAR_END })
  return (
    <figure className="sample-week" aria-label="예시 주간 시간표">
      <div className="my-week-section my-week-section--week">
        <div className="my-calendar sample-week__calendar">
          <div className="my-calendar__axis" aria-hidden="true">
            <div className="my-calendar__hours">
              {CALENDAR_HOURS.map((hour) => <span key={hour} style={{ top: `${percent(hour * 60)}%` }}>{hour}:00</span>)}
            </div>
          </div>
          <div className="my-week" role="region" aria-label="요일별 예시 시간표" tabIndex={0}>
            {days.map((day) => (
              <div className="my-week__day" key={day.weekday} data-weekday={day.weekday}>
                <h4>{DAYS[day.weekday - 1]}요일</h4>
                <div className="my-week__timeline">
                  {CALENDAR_HOURS.map((hour) => <div className="my-week__hour-line" key={hour} style={{ top: `${percent(hour * 60)}%` }} aria-hidden="true" />)}
                  {layoutCalendarBlocks([...day.blocks]).map(({ block, from, to, lane, lanes }) => {
                    const entry = block.entry
                    return (
                      <div key={entry.id} className={`my-week__entry my-week__entry--${entry.kind}${scheduleKindLabel(entry) === '맞춤형' ? ' my-week__entry--custom' : ''}`}
                        style={{ top: `${percent(from)}%`, height: `${(to - from) / (CALENDAR_END - CALENDAR_START) * 100}%`, left: `calc(${lane / lanes * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}>
                        <b title={scheduleEntryHeading(entry)}><ScheduleSubjectIcon entry={entry} /><span className="my-entry-title">{shortTitle(entry)}</span></b>
                        <CompactTime entry={entry} day={day} start={block.start} end={block.end} />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ul className="sample-week__legend" aria-label="칸 색 안내">
        {LEGEND.map(({ kind, label }) => <li key={kind}><i className={`my-week__entry--${kind}`} aria-hidden="true" />{label}</li>)}
      </ul>
      <figcaption className="sample-week__caption"><span className="frontyard-tag frontyard-tag--sample">예시</span> {caption ?? '어느 학교의 자료도 아닌 예시예요. 학교를 고르면 그 학교의 하교 시각부터 채워져요.'}</figcaption>
    </figure>
  )
}
