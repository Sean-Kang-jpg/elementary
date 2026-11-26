import type { CSSProperties, ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { CALENDAR_HOURS } from '../../utils/schedule/calendar'
import { gaps } from '../../utils/schedule/coverage'
import type { CalendarRange } from '../../utils/schedule/editing'
import type { DayPlan } from '../../utils/schedule/engine'
import { formatMinutes } from '../../utils/schedule/fromSchoolData'
import type { ReturnAt } from '../../utils/schedule/starter'
import type { Weekday } from '../../utils/schedule/types'
import MyScheduleDay, { DAY_NAMES } from './MyScheduleDay'

export default function MyScheduleWeek({ days, active, setActive, week, setWeek, school, manual, returnAt, needsCheck, question, care, onMenu, onDismissal, onAdd, onEdit }: {
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
      <button type="button" className="gap-menu-button" aria-label="시간표 안내 및 설정" onClick={onMenu}><MoreHorizontal size={20} aria-hidden="true" /></button>
    </div>
    <div className="gap-weekdays" data-testid="gap-weekdays" aria-label="요일별 하교와 빈 시간">
      {days.map((day) => {
        const missing = day.dismissal.at === null || (gaps(day).length === 0 && day.gaps.length > 0)
        const minutes = gaps(day).reduce((sum, [from, to]) => sum + to - from, 0)
        const length = day.window ? Math.max(0, day.window.to - day.window.from) : 0
        return <button type="button" key={day.weekday} aria-pressed={active === day.weekday} onClick={() => { setActive(day.weekday); if (week) setWeek(false) }}>
          <strong>{DAY_NAMES[day.weekday - 1]}</strong>
          <span>{day.dismissal.at === null ? '하교 미정' : formatMinutes(day.dismissal.at)}</span>
          <i className="gap-meter" aria-hidden="true" style={{ '--open': (missing ? 100 : length ? minutes / length * 100 : 0) + '%' } as CSSProperties} />
          <span>{manual ? '개인 일정' : missing ? '확인 필요' : minutes ? '빈 ' + minutes + '분' : '채움 ✓'}</span>
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
