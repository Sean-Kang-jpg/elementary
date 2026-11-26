import type { SchoolAfterschool, SchoolCareHours } from '../../types'
import { CALENDAR_END } from './calendar.ts'
import { careEntriesFromHours, formatMinutes } from './fromSchoolData.ts'
import { entryForDay } from './dayTimes.ts'
import { WEEKDAYS } from './engine.ts'
import { effectiveEntry } from './overrides.ts'
import type { Minutes, ScheduleEntry, Weekday } from './types'

/**
 * 출발 계획(UX-13, 2026-11-02). 빈 시간표 대신 질문 몇 개로 한 주를 채운다.
 *
 * 1. 보호자가 집에 오는 시각 → 2. 학교 돌봄을 신청할 예정인가 → 3. 맞춤형·방과후도 듣나 → 4. 남은 빈 시간.
 * 답할 때마다 시간표가 바로 바뀌고, 빈 시간은 귀가 시각까지만 센다(그 뒤는 보호자가 있다).
 * 정규수업 끝나면 바로 오는 집은 2·3을 묻지 않는다.
 */
export type ReturnAt = 'dismissal' | 900 | 1020 | 1140

export const DISMISSAL_OPTIONS = [770, 820, 870, 'unknown'] as const
export type DismissalChoice = typeof DISMISSAL_OPTIONS[number]
export interface DismissalAnswer {
  default: DismissalChoice
  weekdays?: Partial<Record<Weekday, DismissalChoice>>
}

export interface StarterAnswers {
  dismissal?: DismissalAnswer
  returnAt: ReturnAt | null
  care: boolean | null
  courses: boolean | null
  /** 4단계에서 '다 됐어요'를 눌렀다. */
  done: boolean
}

type LegacyStarterStep = 'return' | 'care' | 'courses' | 'fill' | 'done'
export type StarterStep = LegacyStarterStep | 'dismissal'

export interface StarterContext {
  /** 학교 하교 자료에 읽을 수 있는 요일이 하나도 없을 때. */
  needsDismissal: boolean
}

export const RETURN_OPTIONS: ReadonlyArray<{ value: ReturnAt; label: string }> = [
  { value: 1140, label: '19시쯤' },
  { value: 1020, label: '17시쯤' },
  { value: 900, label: '15시쯤' },
  { value: 'dismissal', label: '정규수업 끝나면 바로' },
]

export const emptyStarter = (): StarterAnswers => ({ returnAt: null, care: null, courses: null, done: false })

export const answerReturn = (returnAt: ReturnAt, context?: StarterContext): StarterAnswers => returnAt === 'dismissal'
  ? { returnAt, care: false, courses: false, done: !context?.needsDismissal }
  : { returnAt, care: null, courses: null, done: false }

// The current screen uses the legacy sequence until it can render the dismissal question.
export function starterStep(answers: StarterAnswers | undefined): LegacyStarterStep
export function starterStep(answers: StarterAnswers | undefined, context: StarterContext): StarterStep
export function starterStep(answers: StarterAnswers | undefined, context?: StarterContext): StarterStep {
  if (!answers || answers.returnAt === null) return 'return'
  if (!answers.done && context?.needsDismissal && !answers.dismissal) return 'dismissal'
  if (answers.care === null) return 'care'
  if (answers.courses === null) return 'courses'
  return answers.done ? 'done' : 'fill'
}

const validDismissal = (value: unknown): value is DismissalChoice => DISMISSAL_OPTIONS.some(choice => choice === value)
const readDismissal = (value: unknown): DismissalAnswer | undefined => {
  if (!value || typeof value !== 'object') return
  const answer = value as DismissalAnswer
  if (!validDismissal(answer.default)) return
  const weekdays: DismissalAnswer['weekdays'] = {}
  for (const day of WEEKDAYS) {
    const choice = answer.weekdays?.[day]
    if (validDismissal(choice)) weekdays[day] = choice
  }
  return { default: answer.default, ...(Object.keys(weekdays).length ? { weekdays } : {}) }
}

/** SQL 38 시간대 유무. undefined는 아직 읽지 않았거나 읽기에 실패한 경우다. */
export const starterHasSlots = (data: SchoolAfterschool | null | undefined): boolean | undefined =>
  data === undefined ? undefined : Boolean(data?.slots?.length)

export const skipStarterCourses = (answers: StarterAnswers, hasSlots: boolean | undefined): StarterAnswers =>
  hasSlots === false && starterStep(answers) === 'courses' ? { ...answers, courses: false } : answers

const regularSchool = (entry: ScheduleEntry) => entry.kind === 'school' && entry.term !== 'vacation'

/** 저장된 유효한 시각은 학교 자료 또는 부모의 입력을 그대로 사용한다. */
export const hasScheduleDismissal = (entries: readonly ScheduleEntry[]): boolean => entries.some(entry => {
  if (!regularSchool(entry)) return false
  const effective = effectiveEntry(entry)
  return effective !== null && effective.weekdays.some(day => entryForDay(effective, day).end !== null)
})

/** 하교 답과 정규수업 칸을 같은 쓰기에 담는다. 기존 직접 입력과 삭제 기록은 그대로 둔다. */
export const answerStarterDismissal = (
  schoolId: string, answers: StarterAnswers, entries: readonly ScheduleEntry[], dismissal: DismissalAnswer, targetDay?: Weekday,
): { starter: StarterAnswers; entries: ScheduleEntry[] } => {
  const next = [...entries]
  const source = { ref: `starter_dismissal:${schoolId}`, version: '1' }
  for (const day of WEEKDAYS) {
    if (targetDay !== undefined && day !== targetDay) continue
    const id = `school-${schoolId}-${day}`
    const index = next.findIndex(entry => regularSchool(entry) && entry.weekdays.includes(day))
    const current = next[index]
    const owned = current?.source?.ref === source.ref
    const unansweredEstimate = current?.source?.ref === `school_day_estimates:${schoolId}` && current.end === null
    if (current && (current.userOverride || current.dayTimes || current.weekdays.length !== 1 || (!owned && !unansweredEstimate))) continue
    if (!current && next.some(entry => entry.id === id)) continue
    const choice = dismissal.weekdays?.[day] ?? dismissal.default
    const entry: ScheduleEntry = {
      ...(current ?? { id, kind: 'school', label: '정규수업', weekdays: [day], start: null, participation: 'confirmed', term: 'semester' }),
      source, end: choice === 'unknown' ? 820 : choice, evidence: 'estimated',
    }
    if (choice === 'unknown') entry.timeAssumption = '13:40 하교 기본 가정'
    else delete entry.timeAssumption
    if (current) next[index] = entry
    else next.push(entry)
  }
  return { starter: { ...answers, dismissal, done: answers.returnAt === 'dismissal' || answers.done }, entries: next }
}

/**
 * 빈 시간을 세는 끝. 귀가 시각을 모르면 시간표 칸과 같은 19시. 하교 때 보호자가 집에 있으면 null —
 * 메울 빈 시간이 없으니 공백을 세지 않는다.
 */
export const coverageUntil = (answers: StarterAnswers | undefined): Minutes | null =>
  answers?.returnAt === 'dismissal' ? null : typeof answers?.returnAt === 'number' ? answers.returnAt : CALENDAR_END

const unknownCare = (schoolId: string): SchoolCareHours => ({
  school_id: schoolId, source_year: 0, status: 'school_check_needed', afternoon_end: null,
  extended_end: null, extended_condition: null, morning_hours: null, grades: null, source: '운영시간 미확인',
})

const hour = (minutes: Minutes) => `${Math.floor(minutes / 60)}시`

/**
 * 2단계 '예'에 넣는 오후 돌봄. 학교가 공시한 종료 시각까지(없으면 17시 기본 가정), 귀가가 그보다 이르면
 * 귀가 시각에 나오는 것으로 둔다. id는 과목·돌봄 선택과 같아서 거기서도 고른 것으로 보인다.
 */
export const afternoonCareFor = (schoolId: string, care: SchoolCareHours | null, returnAt: Minutes): ScheduleEntry => {
  const [afternoon] = careEntriesFromHours(care ?? unknownCare(schoolId), { afternoon: 'planned' })
  if (afternoon.end === null || afternoon.end <= returnAt) return afternoon
  return { ...afternoon, end: returnAt, evidence: 'estimated', timeAssumption: `${hour(returnAt)} 귀가에 맞춰 ${formatMinutes(returnAt)}에 나옴` }
}

/**
 * 4단계에서 권하는 저녁·연장 돌봄. 학교가 오후 돌봄 종료와 저녁 돌봄 종료를 모두 공시했고, 오후 돌봄이
 * 귀가보다 먼저 끝날 때만 — 공시가 없는 학교에 없는 프로그램을 권하지 않는다.
 */
export const eveningCareFor = (care: SchoolCareHours | null, returnAt: Minutes): ScheduleEntry | null => {
  if (!care || care.status !== 'stated') return null
  const entries = careEntriesFromHours(care, { afternoon: 'planned', extended: 'planned' })
  const [afternoon, evening] = entries
  if (!evening || evening.end === null || afternoon.end === null || afternoon.timeAssumption || afternoon.end >= returnAt) return null
  return evening.end > returnAt ? { ...evening, end: returnAt } : evening
}

/** 2단계 '아니요'나 다시 묻기에서 뺄 돌봄 — 출발 계획이 넣는 두 칸만. */
export const starterCareIds = (schoolId: string) => [`care-${schoolId}-afternoon`, `care-${schoolId}-extended`]

const validReturn = (value: unknown): value is ReturnAt => value === 'dismissal' || value === 900 || value === 1020 || value === 1140
const tri = (value: unknown) => value === null || typeof value === 'boolean'

/** 저장소에서 읽은 값. 모양이 다르면 없던 것으로 본다 — 초안 자체는 버리지 않는다. */
export const readStarter = (value: unknown): StarterAnswers | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const answers = value as StarterAnswers
  if (!(answers.returnAt === null || validReturn(answers.returnAt)) || !tri(answers.care) || !tri(answers.courses) || typeof answers.done !== 'boolean') return undefined
  const dismissal = readDismissal(answers.dismissal)
  return { returnAt: answers.returnAt, care: answers.care, courses: answers.courses, done: answers.done, ...(dismissal ? { dismissal } : {}) }
}
