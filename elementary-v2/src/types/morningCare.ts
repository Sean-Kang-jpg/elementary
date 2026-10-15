import type { Weekday } from '../utils/schedule/types'

/** Track B 표시 모델. DB 스키마가 아니며 Track A 확정 후 어댑터에서 연결한다. */
export interface MorningCareInfo {
  status: 'operating' | 'reported' | 'not_operating' | 'unknown'
  arrivalTime: string | null
  startTime: string | null
  endTime: string | null
  rawHours: string | null
  grades: string | null
  weekdays: Weekday[] | null
  application: string | null
  applicationUrl: string | null
  source: string | null
  sourceUrl: string | null
  schoolYear: number | null
  checkedOn: string | null
}

export interface SchoolEscortInfo {
  status: 'available' | 'unavailable' | 'unknown'
  conditions: string | null
  source: string | null
  schoolYear: number | null
}
