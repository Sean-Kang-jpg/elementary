import type { MorningCareInfo } from '../../types/morningCare'
import { parseMorningTime } from '../morningCare.ts'
import type { ScheduleEntry, Weekday } from './types'

export const morningCareEntryId = (schoolId: string) => `care-${schoolId}-morning`

/** 기존 care 종류와 저장 형식 유지. 요일은 자료 또는 보호자의 명시 선택에서 받는다. */
export const morningCareEntry = (schoolId: string, info: MorningCareInfo, weekdays: Weekday[]): ScheduleEntry | null => {
  if (!['operating', 'reported'].includes(info.status)) return null
  const start = parseMorningTime(info.startTime)
  const end = parseMorningTime(info.endTime)
  const days = [...new Set(weekdays)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 5).sort()
  if (!days.length || start === null || end === null || start >= end || end > 12 * 60) return null
  return {
    id: morningCareEntryId(schoolId), kind: 'care', label: '아침 돌봄', weekdays: days,
    start, end, evidence: info.status === 'operating' ? 'school-plan' : 'estimated',
    participation: 'planned', transitionIn: 'unknown', term: 'semester',
    source: { ref: `school_care_hours:${schoolId}:morning`, version: `${info.schoolYear ?? '학년도 미확인'} · ${info.source ?? '출처 미확인'} · 요일 사용자 선택` },
  }
}

export const isMorningCareEntry = (entry: ScheduleEntry): boolean =>
  entry.kind === 'care' && entry.source?.ref.endsWith(':morning') === true
