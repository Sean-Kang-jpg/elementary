import type { ScheduleEntry, Weekday } from './types'

export const isProgramDaySelected = (entry: ScheduleEntry | undefined, weekday: Weekday) => Boolean(entry
  && entry.weekdays.includes(weekday) && ['planned', 'applying', 'confirmed'].includes(entry.participation))

/** Toggle one day, using the latest store. Never erase the other selected weekdays. */
export function toggleProgramDay(entries: ScheduleEntry[], candidate: ScheduleEntry, weekday: Weekday): ScheduleEntry[] {
  if (!candidate.weekdays.includes(weekday) || candidate.kind === 'school') return entries
  const current = entries.find((entry) => entry.id === candidate.id)
  if (isProgramDaySelected(current, weekday)) {
    const weekdays = current!.weekdays.filter((day) => day !== weekday)
    return entries.flatMap((entry) => entry.id !== candidate.id ? [entry] : weekdays.length ? [{ ...entry, weekdays }] : [])
  }
  const active = current && ['planned', 'applying', 'confirmed'].includes(current.participation)
  const entry: ScheduleEntry = { ...(current ?? candidate), weekdays: [...new Set([...(active ? current.weekdays : []), weekday])].sort(),
    participation: active ? current.participation : 'planned', transitionIn: current?.transitionIn ?? 'unknown',
    ...(candidate.kind === 'afterschool' && candidate.source ? { offeredWeekdays: current?.offeredWeekdays ?? candidate.weekdays } : {}) }
  return [...entries.filter((item) => item.id !== entry.id), entry]
}
