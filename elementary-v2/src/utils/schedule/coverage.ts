import { CALENDAR_END } from './calendar.ts'
import { computeWeek, type DayPlan } from './engine.ts'
import type { Minutes, ScheduleEntry, Weekday } from './types'

/**
 * 한 주가 비지 않고 이어지는가(UX-10 "돌봄 공백 없음 ✓"). 엔진의 공백 계산 결과만 쓴다 — 여기서 시각을 새로 셈하지 않는다.
 *
 * - covered: 평일 다섯 날 모두 하교부터 `until`까지 빈 시간이 없다.
 * - gaps: 빈 시간이 있는 요일과 그 합. 확정·예상 공백만 센다.
 * - unknown: 하교 시각을 모르는 날이 있거나, 빈 시간이 모두 시각 모르는 일정 때문에 불확실하다. ✓도 공백 수도 내지 않는다.
 */
export type WeekCoverage =
  | { state: 'covered'; until: Minutes }
  | { state: 'gaps'; until: Minutes; days: Weekday[]; minutes: number }
  | { state: 'unknown'; until: Minutes }

export const weekCoverage = (days: DayPlan[], until: Minutes): WeekCoverage => {
  if (!days.length || days.some((day) => day.gapsUndetermined !== null)) return { state: 'unknown', until }
  const firm = days.map((day) => ({ day, gaps: day.gaps.filter((gap) => gap.status !== 'uncertain') }))
  const withGaps = firm.filter(({ gaps }) => gaps.length)
  if (withGaps.length) {
    return { state: 'gaps', until, days: withGaps.map(({ day }) => day.weekday), minutes: withGaps.reduce((sum, { gaps }) => sum + gaps.reduce((s, gap) => s + gap.minutes, 0), 0) }
  }
  return days.some((day) => day.gaps.length) ? { state: 'unknown', until } : { state: 'covered', until }
}

/** 시간표 화면과 같은 창(하교 ~ 19:00)으로 한 주를 본다. */
export const planCoverage = (entries: ScheduleEntry[], until: Minutes = CALENDAR_END): WeekCoverage =>
  weekCoverage(computeWeek(entries, { from: 'dismissal', to: until }), until)

const DAYS = ['월', '화', '수', '목', '금']
const duration = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ''}` : `${rest}분`
}

/** 화면 문구. 시간표·입학까지·홈이 같은 말을 쓴다. ✓는 covered에만 붙는다. */
export const describeCoverage = (coverage: WeekCoverage): string => {
  const until = `${Math.floor(coverage.until / 60)}시`
  if (coverage.state === 'covered') return `평일 ${until}까지 빈 시간 없음 ✓`
  if (coverage.state === 'gaps') return `${until}까지 빈 시간 ${coverage.days.map((day) => DAYS[day - 1]).join('·')} 합계 ${duration(coverage.minutes)}`
  return '하교·일정 시각을 아직 몰라 빈 시간을 셀 수 없어요'
}
