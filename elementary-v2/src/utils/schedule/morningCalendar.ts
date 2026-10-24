import type { ScheduleEntry, Weekday } from './types'
import { withCarePlanningDefaults } from './carePlanning.ts'
import { entryForDay } from './dayTimes.ts'

export interface MorningCalendarView {
  start: number | null
  end: number | null
  height: number
  hours: number[]
  hasUnknown: boolean
}
export const isMorningCalendarCare = (entry: ScheduleEntry): boolean => entry.kind === 'care' && (
  entry.source?.ref.endsWith(':morning') === true || /아침|등교\s*전/.test(entry.label)
  || (entry.start !== null && entry.end !== null && entry.start < entry.end && entry.end <= 720)
)
const known = (entry: ScheduleEntry): boolean => entry.start !== null && entry.end !== null && entry.start >= 0 && entry.end > entry.start

/** Display only. Never invent arrival times or modify source/participation data. */
export const morningCalendarView = (entries: ScheduleEntry[]): MorningCalendarView | null => {
  // 요일마다 시각이 다를 수 있어 그 요일들의 시각까지 넣어 띠의 높이를 정한다.
  const visible = entries.filter((entry) => !['cancelled', 'rejected'].includes(entry.participation) && entry.term !== 'vacation')
    .flatMap((entry) => [entry, ...Object.keys(entry.dayTimes ?? {}).map((day) => entryForDay(entry, Number(day) as Weekday))]).map(withCarePlanningDefaults)
  const care = visible.filter(isMorningCalendarCare)
  if (!care.length) return null
  const timed = visible.filter((entry) => entry.kind !== 'school' && known(entry) && entry.start! < 720)
  const hasUnknown = care.some((entry) => !known(entry))
  if (!timed.length) return { start: null, end: null, height: 0, hours: [], hasUnknown }
  const start = Math.floor(Math.min(...timed.map((entry) => entry.start!)) / 60) * 60
  const end = Math.min(720, Math.ceil(Math.max(...timed.map((entry) => entry.end!)) / 60) * 60)
  return { start, end, height: (end - start) * 1.2, hours: Array.from({ length: (end - start) / 60 + 1 }, (_, index) => start / 60 + index), hasUnknown }
}
