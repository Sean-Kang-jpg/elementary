import type { EntryKind, ScheduleEntry, Weekday } from './types'

export const GRID_START = 12 * 60
export const GRID_END = 19 * 60
export const GRID_STEP = 5
export interface CalendarRange { weekday: Weekday; start: number; end: number }
export interface CalendarChange extends CalendarRange {
  label: string
  kind: Exclude<EntryKind, 'school'>
  original?: ScheduleEntry
  fromWeekday?: Weekday
  /** 주변 학원에서 골라 넣는 일정이면 그 기관의 키. 고칠 때는 원래 일정의 키를 그대로 둔다. */
  providerKey?: string
}

export const canEditCalendarEntry = (entry: ScheduleEntry): boolean => entry.kind !== 'school' && entry.source === undefined
export const snapCalendarTime = (value: number): number => Math.max(GRID_START, Math.min(GRID_END, Math.round(value / GRID_STEP) * GRID_STEP))
export const calendarRange = (weekday: Weekday, anchor: number, end?: number): CalendarRange => {
  const first = Math.min(snapCalendarTime(anchor), GRID_END - GRID_STEP)
  if (end === undefined) return { weekday, start: first, end: Math.min(first + 60, GRID_END) }
  const last = snapCalendarTime(end)
  const start = Math.min(first, last)
  return { weekday, start, end: Math.max(Math.max(first, last), start + GRID_STEP) }
}
export const movedCalendarRange = (weekday: Weekday, start: number, end: number, proposedStart: number): CalendarRange | null => {
  const duration = end - start
  if (duration <= 0 || duration > GRID_END - GRID_START) return null
  const latestGridStart = Math.floor((GRID_END - duration) / GRID_STEP) * GRID_STEP
  const nextStart = Math.min(snapCalendarTime(proposedStart), latestGridStart)
  return { weekday, start: nextStart, end: nextStart + duration }
}

type ChangeResult = { ok: true; entries: ScheduleEntry[]; entry: ScheduleEntry } | { ok: false; reason: 'invalid' | 'protected' | 'stale' }

/** Change one weekly occurrence atomically. Other weekdays and participation stay intact. */
export const applyCalendarChange = (entries: ScheduleEntry[], change: CalendarChange, newId: string): ChangeResult => {
  if (!change.label.trim() || change.label.trim().length > 80 || !['afterschool', 'care', 'personal'].includes(change.kind)
    || !Number.isInteger(change.weekday) || change.weekday < 1 || change.weekday > 5
    || !Number.isInteger(change.start) || !Number.isInteger(change.end) || change.start < 0 || change.end >= 1440 || change.start >= change.end) return { ok: false, reason: 'invalid' }
  let original: ScheduleEntry | undefined
  if (change.original) {
    original = entries.find((entry) => entry.id === change.original!.id)
    if (!original || !change.fromWeekday || !original.weekdays.includes(change.fromWeekday) || JSON.stringify(original) !== JSON.stringify(change.original)) return { ok: false, reason: 'stale' }
    if (!canEditCalendarEntry(original)) return { ok: false, reason: 'protected' }
    if (change.weekday === change.fromWeekday && change.start === original.start && change.end === original.end && change.label.trim() === original.label && change.kind === original.kind) return { ok: true, entries, entry: original }
  }
  const remaining = original?.weekdays.filter((day) => day !== change.fromWeekday) ?? []
  const id = original && remaining.length === 0 ? original.id : newId
  if (id !== original?.id && entries.some((entry) => entry.id === id)) return { ok: false, reason: 'invalid' }
  const entry: ScheduleEntry = {
    ...original, id, label: change.label.trim(), kind: change.kind, weekdays: [change.weekday], start: change.start, end: change.end,
    startsAfterSchool: false, evidence: 'estimated', participation: original?.participation ?? 'considering',
    transitionIn: 'unknown', term: original?.term ?? 'semester', userOverride: undefined,
    ...(change.providerKey ? { providerKey: change.providerKey } : {}),
  }
  const next = original ? entries.flatMap((item) => item.id !== original!.id ? [item] : remaining.length ? [{ ...item, weekdays: remaining }, entry] : [entry]) : [...entries, entry]
  return { ok: true, entries: next, entry }
}
