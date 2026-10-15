import type { SchoolCareHours } from '../types'
import type { MorningCareInfo } from '../types/morningCare'

export const unknownMorningCare = (): MorningCareInfo => ({
  status: 'unknown', arrivalTime: null, startTime: null, endTime: null, rawHours: null,
  grades: null, weekdays: null, application: null, applicationUrl: null,
  source: null, sourceUrl: null, schoolYear: null, checkedOn: null,
})

export const morningCareStatusLabel: Record<MorningCareInfo['status'], string> = {
  operating: '운영 확인', reported: '운영시간 기재', not_operating: '미운영 확인', unknown: '미확인',
}

/** 전체 문자열을 읽을 수 있을 때만 시각으로 쓴다. 부분 일치·주석·역전 시각은 추측하지 않는다. */
export const parseMorningTime = (value: string | null): number | null => {
  const match = value?.match(/^(\d{1,2}):([0-5]\d)(?::00)?$/)
  return match && Number(match[1]) < 24 ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** 기존 공통 grades/status는 아침돌봄의 대상/운영 여부를 보증하지 않는다. */
export const morningCareFromLegacy = (care: SchoolCareHours | null): MorningCareInfo => {
  if (!care) return unknownMorningCare()
  const rawHours = care.morning_hours?.trim() || null
  const match = rawHours?.match(/^(\d{1,2}:[0-5]\d)\s*[-~～–]\s*(\d{1,2}:[0-5]\d)$/)
  const start = match ? parseMorningTime(match[1]) : null
  const end = match ? parseMorningTime(match[2]) : null
  const valid = start !== null && end !== null && start < end && end <= 12 * 60
  return {
    ...unknownMorningCare(),
    status: valid ? 'reported' : 'unknown',
    startTime: valid ? match![1].padStart(5, '0') : null,
    endTime: valid ? match![2].padStart(5, '0') : null,
    rawHours, source: care.source || null, schoolYear: care.source_year,
  }
}

export const publicInfoUrl = (value: string | null): string | undefined => {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  } catch { return undefined }
}
