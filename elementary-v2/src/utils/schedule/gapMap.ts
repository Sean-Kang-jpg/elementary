import type { CalendarRange } from './editing.ts'
import type { Minutes, Weekday } from './types.ts'

export const GAP_MINIMUM = 20

/** Snap inside the chosen gap; a 10-minute tick always exists for a 20-minute gap. */
export function gapRange(weekday: Weekday, from: Minutes, to: Minutes, anchor: Minutes): CalendarRange {
  const first = Math.ceil(from / 10) * 10
  const last = Math.max(first, Math.floor((to - 10) / 10) * 10)
  const start = Math.min(last, Math.max(first, Math.floor(anchor / 10) * 10))
  return { weekday, start, end: Math.min(start + 60, to) }
}
