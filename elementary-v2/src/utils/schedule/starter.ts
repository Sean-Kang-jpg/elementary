import type { SchoolCareHours } from '../../types'
import { CALENDAR_END } from './calendar.ts'
import { careEntriesFromHours, formatMinutes } from './fromSchoolData.ts'
import type { Minutes, ScheduleEntry } from './types'

/**
 * 출발 계획(UX-13, 2026-11-02). 빈 시간표 대신 질문 몇 개로 한 주를 채운다.
 *
 * 1. 보호자가 집에 오는 시각 → 2. 학교 돌봄을 신청할 예정인가 → 3. 맞춤형·방과후도 듣나 → 4. 남은 빈 시간.
 * 답할 때마다 시간표가 바로 바뀌고, 빈 시간은 귀가 시각까지만 센다(그 뒤는 보호자가 있다).
 * 정규수업 끝나면 바로 오는 집은 2·3을 묻지 않는다.
 */
export type ReturnAt = 'dismissal' | 900 | 1020 | 1140

export interface StarterAnswers {
  returnAt: ReturnAt | null
  care: boolean | null
  courses: boolean | null
  /** 4단계에서 '다 됐어요'를 눌렀다. */
  done: boolean
}

export type StarterStep = 'return' | 'care' | 'courses' | 'fill' | 'done'

export const RETURN_OPTIONS: ReadonlyArray<{ value: ReturnAt; label: string }> = [
  { value: 1140, label: '19시쯤' },
  { value: 1020, label: '17시쯤' },
  { value: 900, label: '15시쯤' },
  { value: 'dismissal', label: '정규수업 끝나면 바로' },
]

export const emptyStarter = (): StarterAnswers => ({ returnAt: null, care: null, courses: null, done: false })

export const answerReturn = (returnAt: ReturnAt): StarterAnswers => returnAt === 'dismissal'
  ? { returnAt, care: false, courses: false, done: true }
  : { returnAt, care: null, courses: null, done: false }

export const starterStep = (answers: StarterAnswers | undefined): StarterStep => {
  if (!answers || answers.returnAt === null) return 'return'
  if (answers.care === null) return 'care'
  if (answers.courses === null) return 'courses'
  return answers.done ? 'done' : 'fill'
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
  return { returnAt: answers.returnAt, care: answers.care, courses: answers.courses, done: answers.done }
}
