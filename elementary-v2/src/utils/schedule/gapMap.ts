import { gaps } from './coverage.ts'
import type { CalendarRange } from './editing.ts'
import type { DayPlan } from './engine.ts'
import type { Minutes, Weekday } from './types.ts'

export const GAP_MINIMUM = 20

/** Snap inside the chosen gap; a 10-minute tick always exists for a 20-minute gap. */
export function gapRange(weekday: Weekday, from: Minutes, to: Minutes, anchor: Minutes): CalendarRange {
  const first = Math.ceil(from / 10) * 10
  const last = Math.max(first, Math.floor((to - 10) / 10) * 10)
  const start = Math.min(last, Math.max(first, Math.floor(anchor / 10) * 10))
  return { weekday, start, end: Math.min(start + 60, to) }
}

/**
 * 빈 시간 지도에 그릴 빈 칸(C안). 엔진의 확정 공백(`gaps`)에서 후보 일정이 놓인 자리를 뺀다 — 부모가 넣은 후보 위에
 * 빈 칸이 겹쳐 보이지 않게. 완료 판정·`planCoverage`는 그대로 `gaps`를 쓴다(후보는 공백을 채우지 않는다, UX-10).
 */
export function mapGaps(day: DayPlan): Array<[Minutes, Minutes]> {
  const taken = day.candidates.map(({ start, end }) => [start, end] as const).sort((a, b) => a[0] - b[0])
  return gaps(day).flatMap(([from, to]) => {
    const pieces: Array<[Minutes, Minutes]> = []
    let cursor = from
    for (const [start, end] of taken) {
      if (end <= cursor || start >= to) continue
      if (start > cursor) pieces.push([cursor, start])
      cursor = Math.max(cursor, end)
    }
    if (cursor < to) pieces.push([cursor, to])
    return pieces
  })
}
