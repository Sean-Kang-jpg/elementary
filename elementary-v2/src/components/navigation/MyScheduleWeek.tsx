import type { CSSProperties, ReactNode } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import { CALENDAR_HOURS } from '../../utils/schedule/calendar'
import { gaps } from '../../utils/schedule/coverage'
import { mapGaps } from '../../utils/schedule/gapMap'
import type { CalendarRange } from '../../utils/schedule/editing'
import type { DayPlan } from '../../utils/schedule/engine'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import type { ReturnAt } from '../../utils/schedule/starter'
import type { Weekday } from '../../utils/schedule/types'
import MyScheduleDay, { DAY_NAMES, durationLabel, shortDuration } from './MyScheduleDay'

export default function MyScheduleWeek({ days, active, setActive, week, setWeek, school, manual, returnAt, needsCheck, question, care, onMenu, onAddAny, onDismissal, onAdd, onEdit }: {
  days: DayPlan[]
  active: Weekday
  setActive: (day: Weekday) => void
  week: boolean
  setWeek: (week: boolean) => void
  school: ReactNode
  manual: boolean
  returnAt: ReturnAt | null
  needsCheck: ReadonlySet<string>
  question: ReactNode
  care?: { weekday: Weekday; content: ReactNode }
  onMenu: () => void
  onAddAny: () => void
  onDismissal: (day: Weekday) => void
  onAdd: (range: CalendarRange, gap?: [number, number]) => void
  onEdit: (id: string, day: Weekday) => void
}) {
  return <div className="gap-map" data-week={week || undefined} data-testid="gap-map">
    <div className="gap-toolbar">
      {school}
      <div className="gap-toggle" role="group" aria-label="시간표 보기">
        <button type="button" aria-pressed={!week} onClick={() => setWeek(false)}>하루</button>
        <button type="button" aria-pressed={week} onClick={() => setWeek(true)}>한 주</button>
      </div>
      <button type="button" className="gap-add-button" aria-label="일정 추가" data-testid="gap-add" onClick={onAddAny}><Plus size={20} strokeWidth={2.5} aria-hidden="true" /></button>
      <button type="button" className="gap-menu-button" aria-label="시간표 안내 및 설정" onClick={onMenu}><MoreHorizontal size={20} aria-hidden="true" /></button>
    </div>
    <div className="gap-weekdays" data-testid="gap-weekdays" aria-label="요일별 하교와 빈 시간">
      {days.map((day) => {
        const missing = day.dismissal.at === null || (gaps(day).length === 0 && day.gaps.length > 0)
        const minutes = mapGaps(day).reduce((sum, [from, to]) => sum + to - from, 0)
        const from = day.window?.from ?? 0, length = day.window ? Math.max(0, day.window.to - day.window.from) : 0
        const summary = manual ? '개인 일정' : missing ? '확인 필요' : minutes ? '빈 ' + shortDuration(minutes) : '채움 ✓'
        return <button type="button" key={day.weekday} aria-pressed={active === day.weekday} data-filled={!manual && !missing && !minutes || undefined}
          aria-label={DAY_NAMES[day.weekday - 1] + '요일 · 하교 ' + (day.dismissal.at === null ? '미정' : formatMinutes(day.dismissal.at)) + ' · ' + (manual || missing ? summary : minutes ? '빈 시간 ' + durationLabel(minutes) : '빈 시간 없음')}
          onClick={() => { setActive(day.weekday); if (week) setWeek(false) }}>
          <strong>{DAY_NAMES[day.weekday - 1]}</strong>
          <span>{day.dismissal.at === null ? '하교 미정' : formatMinutes(day.dismissal.at)}</span>
          <i className="gap-meter" aria-hidden="true" data-unknown={missing || undefined}>
            {!missing && length > 0 && mapGaps(day).map(([start, end]) => <b key={start}
              style={{ left: (start - from) / length * 100 + '%', width: (end - start) / length * 100 + '%' } as CSSProperties} />)}
          </i>
          <span className="gap-summary">{summary}</span>
        </button>
      })}
    </div>
    <div className="gap-board">
      <div className="gap-axis" aria-hidden="true">{CALENDAR_HOURS.map((hour, i) => <span key={hour} style={{ top: i / 7 * 100 + '%' }}>{hour}:00</span>)}</div>
      {(week ? days : [days[active - 1]]).map((day) => <MyScheduleDay key={day.weekday} day={day} compact={week} manual={manual}
        homeAt={returnAt === 'dismissal' ? day.dismissal.at : returnAt} answered={returnAt !== null} needsCheck={needsCheck}
        care={care?.weekday === day.weekday ? care.content : undefined}
        onDismissal={onDismissal} onAdd={onAdd} onEdit={onEdit} />)}
      {question}
    </div>
  </div>
}
