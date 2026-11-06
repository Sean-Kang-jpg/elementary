import type { Minutes } from './schedule/types'

export type CareFit = 'fits' | 'unknown' | 'short'

const HOURS = /^\d{2}:\d{2}~(\d{2}):(\d{2})$/
const ORDER: Record<CareFit, number> = { fits: 0, unknown: 1, short: 2 }

/** 학기 중 운영 시간(`HH:MM~HH:MM`)의 끝이 우리 집 귀가 시각에 닿는가. 비었거나 형식이 다르면 모른다고 답한다. */
export const careFit = (termHours: string | null, until: Minutes): CareFit => {
  const match = termHours?.trim().match(HOURS)
  if (!match) return 'unknown'
  return Number(match[1]) * 60 + Number(match[2]) >= until ? 'fits' : 'short'
}

/** 맞는 곳 → 모르는 곳 → 일찍 닫는 곳, 같은 묶음 안에서는 가까운 순(UX-16). 인기·순위는 쓰지 않는다. */
export const sortByFit = <T extends { term_hours: string | null; straight_distance_m: number }>(centers: T[], until: Minutes): T[] =>
  [...centers].sort((a, b) => ORDER[careFit(a.term_hours, until)] - ORDER[careFit(b.term_hours, until)] || a.straight_distance_m - b.straight_distance_m)

export const describeUntil = (until: Minutes) => {
  const minutes = until % 60
  return `${Math.floor(until / 60)}시${minutes ? ` ${minutes}분` : ''}`
}
