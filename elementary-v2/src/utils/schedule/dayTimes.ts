import type { DayTime, ParticipationStatus, ScheduleEntry, Weekday } from './types'

/**
 * 요일별 시각과 요일 복사 (2026-10-23). 같은 프로그램을 요일마다 다른 시각으로 쓰는 것은 일정을
 * 쪼개지 않고 dayTimes에 둔다 — 쪼개면 강좌·돌봄 선택 화면이 ID로 찾는 일정이 둘이 된다.
 */

const ACTIVE: ReadonlySet<ParticipationStatus> = new Set(['planned', 'applying', 'confirmed'])
const ALL: Weekday[] = [1, 2, 3, 4, 5]

const baseTime = (entry: ScheduleEntry): DayTime | null =>
  entry.startsAfterSchool && entry.end !== null ? { start: 'dismissal', end: entry.end }
    : entry.start !== null && entry.end !== null ? { start: entry.start, end: entry.end } : null
const sameTime = (a: DayTime | null, b: DayTime | null) => Boolean(a && b && a.start === b.start && a.end === b.end)

/** 그 요일에 쓰는 일정. dayTimes가 없으면 그대로 돌려준다. */
export const entryForDay = (entry: ScheduleEntry, weekday: Weekday): ScheduleEntry => {
  const time = entry.dayTimes?.[weekday]
  if (!time) return entry
  return {
    ...entry, start: time.start === 'dismissal' ? null : time.start, end: time.end, startsAfterSchool: time.start === 'dismissal',
    timeAssumption: undefined, evidence: 'estimated', dayTimes: undefined,
  }
}

/** 그 요일의 시각. 모르면 null. */
export const timeOnDay = (entry: ScheduleEntry, weekday: Weekday): DayTime | null => entry.dayTimes?.[weekday] ?? baseTime(entry)

/** 강좌는 열리는 요일에만 둔다. 출처 없는 일정·돌봄은 모든 평일. */
export const allowedWeekdays = (entry: ScheduleEntry): Weekday[] =>
  entry.kind === 'school' ? [] : entry.kind === 'afterschool' && entry.source ? entry.offeredWeekdays ?? entry.weekdays : ALL

const valid = (time: DayTime) => Number.isInteger(time.end) && time.end > 0 && time.end < 1440
  && (time.start === 'dismissal' || (Number.isInteger(time.start) && time.start >= 0 && time.start < time.end))

const tidy = (entry: ScheduleEntry): ScheduleEntry => {
  const base = baseTime(entry)
  const dayTimes = Object.fromEntries(Object.entries(entry.dayTimes ?? {})
    .filter(([day, time]) => entry.weekdays.includes(Number(day) as Weekday) && !sameTime(time, base)))
  const rest = { ...entry }
  delete rest.dayTimes
  return Object.keys(dayTimes).length ? { ...rest, dayTimes } : rest
}

/**
 * 고른 요일에 같은 시각을 넣는다. 그 요일이 일정에 없으면 더한다. 일정의 모든 요일이면 기본 시각을
 * 바꾸고(userOverride로 남겨 새 판 자료가 덮지 않게), 일부면 그 요일만 dayTimes에 둔다.
 */
export const setEntryTimes = (entries: ScheduleEntry[], id: string, days: Weekday[], time: DayTime, label?: string): ScheduleEntry[] | null => {
  const entry = entries.find((item) => item.id === id)
  if (!entry || entry.kind === 'school' || !valid(time) || !days.length) return null
  const allowed = allowedWeekdays(entry)
  if (days.some((day) => !allowed.includes(day))) return null
  const weekdays = [...new Set([...entry.weekdays, ...days])].sort() as Weekday[]
  let next: ScheduleEntry = { ...entry, weekdays, ...(label?.trim() ? { label: label.trim() } : {}),
    participation: ACTIVE.has(entry.participation) ? entry.participation : 'planned' }
  if (weekdays.every((day) => days.includes(day))) {
    next = { ...next, start: time.start === 'dismissal' ? null : time.start, end: time.end, startsAfterSchool: time.start === 'dismissal',
      evidence: 'estimated', timeAssumption: undefined, dayTimes: undefined,
      userOverride: { ...entry.userOverride, start: time.start === 'dismissal' ? null : time.start, end: time.end } }
  } else {
    const dayTimes = { ...entry.dayTimes }
    for (const day of days) dayTimes[day] = time
    next = { ...next, dayTimes }
  }
  return entries.map((item) => item.id === id ? tidy(next) : item)
}

/** 한 요일에서 뺀다. 마지막 요일이면 일정이 없어진다. */
export const removeEntryDay = (entries: ScheduleEntry[], id: string, weekday: Weekday): ScheduleEntry[] =>
  entries.flatMap((entry) => {
    if (entry.id !== id) return [entry]
    const weekdays = entry.weekdays.filter((day) => day !== weekday)
    return weekdays.length ? [tidy({ ...entry, weekdays })] : []
  })

/**
 * 일정 하나를 다른 요일에도 같은 시각으로 넣는다(돌봄·강좌·학원 각각의 '다른 요일에도 넣기', 2026-10-24).
 * 그 요일에 열리지 않는 학교 강좌 요일은 넣지 않는다. 바뀐 것이 없으면 null.
 */
export const repeatEntry = (entries: ScheduleEntry[], id: string, from: Weekday, targets: Weekday[]): ScheduleEntry[] | null => {
  const entry = entries.find((item) => item.id === id)
  if (!entry || entry.kind === 'school' || !entry.weekdays.includes(from)) return null
  const allowed = allowedWeekdays(entry)
  const days = targets.filter((day) => day !== from && allowed.includes(day) && !entry.weekdays.includes(day))
  if (!days.length) return null
  const time = timeOnDay(entry, from)
  const dayTimes = { ...entry.dayTimes }
  for (const day of days) { if (time) dayTimes[day] = time; else delete dayTimes[day] }
  const next = tidy({ ...entry, weekdays: [...new Set([...entry.weekdays, ...days])].sort() as Weekday[], dayTimes })
  return entries.map((item) => item.id === id ? next : item)
}
