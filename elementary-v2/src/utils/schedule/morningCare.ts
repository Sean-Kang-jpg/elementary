import type { MorningCareInfo } from '../../types/morningCare'
import { parseMorningTime } from '../morningCare.ts'
import type { ScheduleEntry, Weekday } from './types'
import { DEFAULT_MORNING_START, DEFAULT_MORNING_END } from './carePlanning.ts'

export const morningCareEntryId = (schoolId: string) => `care-${schoolId}-morning`

/** 기존 care 종류와 저장 형식 유지. 요일은 자료 또는 보호자의 명시 선택에서 받는다. */
export const morningCareEntry = (schoolId: string, info: MorningCareInfo, weekdays: Weekday[]): ScheduleEntry | null => {
  if (info.status === 'not_operating') return null
  const known = ['operating', 'reported'].includes(info.status)
  const start = known ? parseMorningTime(info.startTime) : null
  const end = known ? parseMorningTime(info.endTime) : null
  const valid = start !== null && end !== null && start < end && end <= 12 * 60
  const days = [...new Set(weekdays)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 5).sort()
  if (!days.length) return null
  return {
    id: morningCareEntryId(schoolId), kind: 'care', label: '아침 돌봄', weekdays: days,
    start: valid ? start : DEFAULT_MORNING_START, end: valid ? end : DEFAULT_MORNING_END,
    evidence: valid && info.status === 'operating' ? 'school-plan' : 'estimated',
    ...(!valid ? { timeAssumption: '08:00–09:00 기본 가정' } : {}),
    participation: 'planned', transitionIn: 'unknown', term: 'semester',
    source: { ref: `school_care_hours:${schoolId}:morning`, version: `${info.schoolYear ?? '학년도 미확인'} · ${info.source ?? '출처 미확인'} · 요일 사용자 선택` },
  }
}

export const isMorningCareEntry = (entry: ScheduleEntry): boolean =>
  entry.kind === 'care' && entry.source?.ref.endsWith(':morning') === true
