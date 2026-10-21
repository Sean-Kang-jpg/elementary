import type { ParticipationStatus, ScheduleEntry, Weekday } from './types'

/**
 * 돌봄교실 안에서 운영하는 맞춤형은 그날 돌봄을 다니는 아이만 참여할 수 있다(15-라 운영계획의
 * "돌봄 내 맞춤형", 2026-10-21 결정). 이런 일정(requiresCare)이 있는데 같은 요일에 오후 돌봄이
 * 계획에 없거나 미선정·취소면 알린다. 돌봄을 대신 넣지는 않는다 — 넣을지는 부모가 고른다.
 */

/** 돌봄이 이 요일을 맡는다고 볼 수 있는 참여 상태. 후보(considering)도 계획 단계로 본다. */
const CARE_ACTIVE: ReadonlySet<ParticipationStatus> = new Set(['considering', 'planned', 'applying', 'confirmed'])
const ENTRY_ACTIVE: ReadonlySet<ParticipationStatus> = new Set(['considering', 'planned', 'applying', 'confirmed'])

export interface CareDependencyIssue {
  entryId: string
  weekday: Weekday
  /** no_care: 그 요일 돌봄 일정이 없다. care_inactive: 있지만 미선정·취소다. */
  reason: 'no_care' | 'care_inactive'
}

export const careDependencyIssues = (entries: ScheduleEntry[]): CareDependencyIssue[] => {
  const care = entries.filter((entry) => entry.kind === 'care' && !entry.userOverride?.deleted)
  const issues: CareDependencyIssue[] = []
  for (const entry of entries) {
    if (!entry.requiresCare || entry.userOverride?.deleted || !ENTRY_ACTIVE.has(entry.participation)) continue
    for (const weekday of entry.weekdays) {
      const sameDay = care.filter((c) => c.weekdays.includes(weekday))
      if (!sameDay.length) issues.push({ entryId: entry.id, weekday, reason: 'no_care' })
      else if (!sameDay.some((c) => CARE_ACTIVE.has(c.participation))) issues.push({ entryId: entry.id, weekday, reason: 'care_inactive' })
    }
  }
  return issues
}
