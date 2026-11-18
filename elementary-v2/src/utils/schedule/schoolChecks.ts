import type { ScheduleEntry, Weekday } from './types'
import { entryForDay } from './dayTimes.ts'
import { withCarePlanningDefaults } from './carePlanning.ts'

export interface SchoolCheckFact {
  kind: 'missing' | 'estimate' | 'assumption' | 'participation'
  value: string
  weekdays?: Weekday[]
}

export interface SchoolCheck {
  id: string
  title: string
  kind: 'dismissal' | 'care' | 'afterschool'
  facts: SchoolCheckFact[]
  reasons: string[]
  entryId?: string
  weekday?: Weekday
}
const DAYS = ['월', '화', '수', '목', '금']
const WEEK: Weekday[] = [1, 2, 3, 4, 5]
const daysText = (days: Weekday[]) => [...new Set(days)].sort().map(day => DAYS[day - 1]).join('·')
const active = (entry: ScheduleEntry) => entry.weekdays.length > 0 && !entry.userOverride?.deleted
  && !['rejected', 'cancelled'].includes(entry.participation) && entry.term !== 'vacation'

/** Read-only summary of the same effective weekday times the timetable renders. */
export const schoolChecks = (entries: readonly ScheduleEntry[]): SchoolCheck[] => {
  const current = entries.filter(active)
  const result: SchoolCheck[] = []
  const missing: Weekday[] = []
  const estimated: Weekday[] = []
  let schoolTarget: ScheduleEntry | undefined
  let targetDay: Weekday | undefined
  for (const day of WEEK) {
    const school = current.find(entry => entry.kind === 'school' && entry.weekdays.includes(day))
    const effective = school && entryForDay(school, day)
    if (!effective || effective.end === null || effective.evidence === 'unknown') missing.push(day)
    else if (effective.evidence !== 'confirmed') estimated.push(day)
    else continue
    if (!schoolTarget && school) { schoolTarget = school; targetDay = day }
  }
  if (missing.length || estimated.length) result.push({
    id: 'school-dismissal', title: '요일별 하교 시각', kind: 'dismissal',
    facts: [
      ...(missing.length ? [{ kind: 'missing' as const, value: '하교 시간 미확인', weekdays: missing }] : []),
      ...(estimated.length ? [{ kind: 'estimate' as const, value: '예상 하교 시간', weekdays: estimated }] : []),
    ],
    reasons: [
      ...(missing.length ? [`${daysText(missing)}요일 하교 시각을 아직 몰라요. 학교 안내에서 확인하세요.`] : []),
      ...(estimated.length ? [`${daysText(estimated)}요일은 예상 하교 시각이에요. 실제 시각을 학교에 확인하세요.`] : []),
    ], entryId: schoolTarget?.id, weekday: targetDay,
  })
  for (const entry of current.filter(entry => entry.kind === 'care' || entry.kind === 'afterschool')) {
    const reasons: string[] = []
    const facts: SchoolCheckFact[] = []
    const assumptions = new Map<string, Weekday[]>()
    const unknown: Weekday[] = []
    const provisional: Weekday[] = []
    for (const day of [...new Set(entry.weekdays)]) {
      const effective = withCarePlanningDefaults(entryForDay(entry, day))
      if (effective.timeAssumption) assumptions.set(effective.timeAssumption, [...(assumptions.get(effective.timeAssumption) ?? []), day])
      else if (effective.end === null || (effective.start === null && !effective.startsAfterSchool) || effective.evidence === 'unknown' || (effective.start !== null && effective.end <= effective.start)) unknown.push(day)
      else if (effective.evidence !== 'confirmed') provisional.push(day)
    }
    for (const [assumption, days] of assumptions) facts.push({ kind: 'assumption', value: assumption, weekdays: days })
    if (unknown.length) facts.push({ kind: 'missing', value: '운영 시간 미확인', weekdays: unknown })
    if (provisional.length) facts.push({ kind: 'estimate', value: '운영계획·입력 시각', weekdays: provisional })
    if (entry.participation !== 'confirmed') facts.push({ kind: 'participation', value: entry.participation === 'applying' ? '신청 중' : '참여 미확정' })
    for (const [assumption, days] of assumptions) reasons.push(`${daysText(days)}요일: ${assumption}. 실제 운영 시간을 확인하세요.`)
    if (unknown.length) reasons.push(`${daysText(unknown)}요일 시작·종료 시각이 미확인이에요. 학교에서 확인한 뒤 입력하세요.`)
    if (provisional.length) reasons.push(`${daysText(provisional)}요일은 운영계획 또는 입력한 시각이에요. 실제 이용 시간과 맞는지 확인하세요.`)
    if (entry.participation !== 'confirmed') reasons.push(entry.participation === 'applying'
      ? '신청 중이에요. 선정 결과와 이용 시작일을 학교에 확인하세요.'
      : '우리 아이의 참여가 확정되지 않았어요. 신청 방법과 선정 여부를 학교에 확인하세요.')
    if (reasons.length) result.push({ id: entry.id, title: entry.label, kind: entry.kind as 'care' | 'afterschool', facts, reasons, entryId: entry.id, weekday: entry.weekdays[0] })
  }
  return result
}
