import { allowedWeekdays } from '../../utils/schedule/dayTimes'
import type { ScheduleEntry, Weekday } from '../../utils/schedule/types'

const DAYS = ['월', '화', '수', '목', '금']

/**
 * 고른 돌봄·강좌·학원 하나를 다른 요일에도 같은 시간으로 넣는다(2026-10-24). 눌린 칩을 다시 누르면 그 요일에서 뺀다.
 * 학교 강좌는 열리는 요일만 누를 수 있다.
 */
export default function RepeatDays({ entry, weekday, onRepeat, onRemoveDay }: {
  /** 저장된 일정. 아직 저장되지 않았으면 그리지 않는다. */
  entry: ScheduleEntry | undefined
  weekday: Weekday
  onRepeat: (id: string, from: Weekday, targets: Weekday[]) => boolean
  onRemoveDay: (id: string, weekday: Weekday) => boolean
}) {
  if (!entry || entry.kind === 'school' || !entry.weekdays.includes(weekday)) return null
  const allowed = allowedWeekdays(entry)
  const others = ([1, 2, 3, 4, 5] as Weekday[]).filter((day) => day !== weekday)
  const open = others.filter((day) => allowed.includes(day) && !entry.weekdays.includes(day))
  return <div className="my-repeat-days" role="group" aria-label={`${entry.label} 다른 요일에도 넣기`}>
    <span>다른 요일에도 넣기</span>
    {others.map((day) => {
      const on = entry.weekdays.includes(day)
      return <button type="button" key={day} aria-pressed={on} disabled={!allowed.includes(day)}
        aria-label={`${entry.label} ${DAYS[day - 1]}요일 ${on ? '빼기' : '넣기'}`} title={!allowed.includes(day) ? '이 강좌가 열리지 않는 요일' : undefined}
        onClick={() => on ? onRemoveDay(entry.id, day) : onRepeat(entry.id, weekday, [day])}>{DAYS[day - 1]}</button>
    })}
    {open.length > 1 && <button type="button" className="my-repeat-days__all" onClick={() => onRepeat(entry.id, weekday, open)}>모두</button>}
  </div>
}
