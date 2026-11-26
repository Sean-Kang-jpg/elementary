import { allowedWeekdays, setEntryTimes } from './dayTimes.ts'
import type { CalendarRange } from './editing.ts'
import type { DayTime, EntryKind, ParticipationStatus, ScheduleEntry, Weekday } from './types.ts'

export interface GapEdit {
  label: string
  kind: Exclude<EntryKind, 'school'>
  activityType?: 'academy'
  time: DayTime | null
  weekdays: Weekday[]
  participation: ParticipationStatus
  original?: ScheduleEntry
}

export function openGapEdit(range: CalendarRange): GapEdit {
  return { label: '', kind: 'personal', time: { start: range.start, end: range.end }, weekdays: [range.weekday], participation: 'considering' }
}

/** Preserve untouched weekdays, participation, and source metadata. Reject a stale sheet. */
export function applyGapEdit(entries: ScheduleEntry[], edit: GapEdit, id: string): ScheduleEntry[] | null {
  const { label, original, weekdays, time, activityType, participation, kind } = edit
  if (!label.trim() || label.trim().length > 80 || !weekdays.length || weekdays.some(day => day < 1 || day > 5)) return null
  if (time && (!Number.isInteger(time.end) || time.end <= 0 || time.end >= 1440
    || (time.start !== 'dismissal' && (!Number.isInteger(time.start) || time.start < 0 || time.start >= time.end)))) return null
  if (!original) {
    if (!time || entries.some(entry => entry.id === id)) return null
    return [...entries, {
      id, label: label.trim(), weekdays, kind, activityType, participation, evidence: 'estimated', term: 'semester',
      start: time.start === 'dismissal' ? null : time.start, end: time.end, startsAfterSchool: time.start === 'dismissal',
    }]
  }
  if (original.kind === 'school' || JSON.stringify(entries.find(entry => entry.id === original.id)) !== JSON.stringify(original)
    || weekdays.some(day => !allowedWeekdays(original).includes(day))) return null
  if (!time && weekdays.some(day => !original.weekdays.includes(day))) return null
  const timed = time ? setEntryTimes(entries, original.id, weekdays, time) : entries
  if (!timed) return null
  return timed.map(entry => entry.id === original.id ? {
    ...entry, participation, ...(!entry.source && { label: label.trim(), kind, activityType }),
  } : entry)
}
