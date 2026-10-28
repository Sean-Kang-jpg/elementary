import type { ScheduleEntry } from './types'

const KEY = 'elementary-schedule-plans-v1'
const EVENT = 'elementary-schedule-plans-change'
export interface SchoolPlan {
  schoolId: string
  schoolName: string
  entryYear: number | null
  updatedAt: string
  entries: ScheduleEntry[]
}
// 2026-10-27까지는 학교 하나를 '내 시간표'로 고르는 activeSchoolId가 있었다. 저장소에 남아 있어도 읽지 않고,
// 다음 저장 때 빠진다. 지금은 내 학교마다 시간표가 하나씩이다.
export interface PlanStore {
  version: 1
  plans: SchoolPlan[]
}
export const emptyPlans = (): PlanStore => ({ version: 1, plans: [] })
const time = (value: unknown) => value === null || (Number.isInteger(value) && Number(value) >= 0 && Number(value) < 1440)
const validEntry = (value: unknown): value is ScheduleEntry => {
  if (!value || typeof value !== 'object') return false
  const e = value as ScheduleEntry
  return typeof e.id === 'string' && typeof e.label === 'string'
    && ['school', 'afterschool', 'care', 'personal'].includes(e.kind)
    && Array.isArray(e.weekdays) && e.weekdays.length > 0 && e.weekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 5)
    && time(e.start) && time(e.end)
    && ['confirmed', 'school-plan', 'estimated', 'unknown'].includes(e.evidence)
    && ['considering', 'planned', 'applying', 'confirmed', 'rejected', 'cancelled'].includes(e.participation)
    && (e.startsAfterSchool === undefined || typeof e.startsAfterSchool === 'boolean')
    && (e.transitionIn === undefined || ['confirmed', 'prohibited', 'unknown'].includes(e.transitionIn))
    && (e.term === undefined || ['semester', 'vacation', 'both'].includes(e.term))
    && (e.source === undefined || (e.source !== null && typeof e.source.ref === 'string' && typeof e.source.version === 'string'))
    && (e.dayTimes === undefined || (e.dayTimes !== null && typeof e.dayTimes === 'object' && Object.entries(e.dayTimes).every(([day, t]) =>
      ['1', '2', '3', '4', '5'].includes(day) && t && (t.start === 'dismissal' || (t.start !== null && time(t.start))) && Number.isInteger(t.end) && time(t.end))))
    && (e.offeredWeekdays === undefined || (Array.isArray(e.offeredWeekdays) && e.offeredWeekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 5)))
}
export const readPlans = (): PlanStore => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null') as PlanStore | null
    if (!value || value.version !== 1 || !Array.isArray(value.plans)) return emptyPlans()
    const plans = value.plans.filter((p) => p && typeof p.schoolId === 'string' && typeof p.schoolName === 'string'
      && (p.entryYear === null || Number.isInteger(p.entryYear)) && typeof p.updatedAt === 'string'
      && Array.isArray(p.entries) && p.entries.every(validEntry))
    return { version: 1, plans }
  } catch { return emptyPlans() }
}
export const upsertPlan = (store: PlanStore, plan: SchoolPlan): PlanStore => ({
  ...store, plans: [plan, ...store.plans.filter((p) => p.schoolId !== plan.schoolId)],
})
export const deletePlan = (store: PlanStore, schoolId: string): PlanStore => ({
  ...store, plans: store.plans.filter((p) => p.schoolId !== schoolId),
})
export const writePlans = (store: PlanStore) => {
  // Notify only after a successful write; quota/privacy failures must not appear saved.
  localStorage.setItem(KEY, JSON.stringify(store))
  window.dispatchEvent(new Event(EVENT))
}
export const subscribePlans = (listener: () => void) => {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', listener) }
}
