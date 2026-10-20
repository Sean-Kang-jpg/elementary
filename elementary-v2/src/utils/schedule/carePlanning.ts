import type { ScheduleEntry } from './types'

export const DEFAULT_MORNING_START = 8 * 60
export const DEFAULT_MORNING_END = 9 * 60
export const DEFAULT_AFTERNOON_END = 17 * 60

/** Planning assumptions only; never turn missing operating data into verified hours. */
export const withCarePlanningDefaults = (entry: ScheduleEntry): ScheduleEntry => {
  if (entry.kind !== 'care' || entry.term === 'vacation' || entry.userOverride) return entry
  const morning = entry.source?.ref.endsWith(':morning') || /아침\s*돌봄/.test(entry.label)
  if (morning && entry.start === null && entry.end === null) return {
    ...entry, start: DEFAULT_MORNING_START, end: DEFAULT_MORNING_END,
    evidence: 'estimated', timeAssumption: '08:00–09:00 기본 가정',
  }
  if (entry.label === '오후 돌봄' && entry.end === null) return {
    ...entry, startsAfterSchool: entry.start === null ? true : entry.startsAfterSchool,
    end: DEFAULT_AFTERNOON_END, evidence: 'estimated', timeAssumption: '17:00 종료 기본 가정',
  }
  return entry
}
