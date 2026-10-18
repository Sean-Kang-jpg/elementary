import type { DayPlan } from './engine'
import { isMorningCalendarCare } from './morningCalendar.ts'
import type { ScheduleEntry } from './types'

export interface DayTimelineItem {
  entry: ScheduleEntry
  start: number | null
  end: number | null
  section: 'morning' | 'school' | 'afternoon' | 'unknown'
}

/** Presentation only. In particular, never expose the engine's assumed school start. */
export function dayTimelineItems(day: DayPlan, entries: ScheduleEntry[]): DayTimelineItem[] {
  const placed = new Map([...day.blocks, ...day.candidates].map((block) => [block.entry.id, block]))
  const order = { morning: 0, school: 1, afternoon: 2, unknown: 3 }
  return entries.filter((entry) => entry.weekdays.includes(day.weekday)
    && entry.term !== 'vacation' && !['cancelled', 'rejected'].includes(entry.participation))
    .map((entry): DayTimelineItem => {
      if (entry.kind === 'school') return { entry, start: null, end: day.dismissal.at, section: 'school' }
      const block = placed.get(entry.id)
      const section = isMorningCalendarCare(entry) || (block && block.start < 720) ? 'morning' : block ? 'afternoon' : 'unknown'
      return { entry, start: block?.start ?? null, end: block?.end ?? null, section }
    })
    .sort((a, b) => order[a.section] - order[b.section]
      || (a.start ?? Infinity) - (b.start ?? Infinity) || (a.end ?? Infinity) - (b.end ?? Infinity))
}
