import { scheduleEntrySubject } from './calendar.ts'
import type { DayPlan } from './engine'
import type { ScheduleEntry, SlotIntent } from './types'

/**
 * 칸의 의도(UX-14, 2026-11-02). 이 시간이 아이에게 무슨 시간인가 — 엔진의 evidence(어떻게 아나)·
 * participation(어디까지 왔나)와 다른 축이라 계산에 쓰지 않고 표시만 한다.
 *
 * '여백'은 임시 이름이다(백로그 6절 미결정 1). 바꿀 때는 이 표의 문구만 고친다 — 저장값은 'free'.
 */
export const INTENT_LABELS: Record<SlotIntent, string> = {
  safety: '안전',
  basics: '기초',
  interest: '관심',
  free: '여백',
  undecided: '미정',
}

export const INTENT_HINTS: Record<SlotIntent, string> = {
  safety: '어른이 곁에 있는 시간(돌봄 등)',
  basics: '읽기·셈 같은 기초를 다지는 시간',
  interest: '아이가 좋아하거나 해 보고 싶은 것',
  free: '정해진 것 없이 놀고 쉬는 시간',
  undecided: '아직 정하지 않았어요',
}

export const INTENTS = Object.keys(INTENT_LABELS) as SlotIntent[]

/**
 * 부모가 고른 의도, 없으면 종류·과목으로 정한 기본값. 정규수업은 의도를 붙이지 않는다(null).
 * 기본값은 저장하지 않는다 — 규칙이 바뀌어도 부모가 고른 것만 남는다.
 */
export const entryIntent = (entry: ScheduleEntry): SlotIntent | null => {
  if (entry.kind === 'school') return null
  if (entry.intent) return entry.intent
  const subject = scheduleEntrySubject(entry)
  if (subject === 'care') return 'safety'
  if (subject === 'reading' || subject === 'math') return 'basics'
  if (subject === 'personal') return 'undecided'
  return 'interest'
}

// 겹친 시간은 아이가 실제로 하고 있는 쪽으로 센다 — 돌봄 중 방과후에 다녀오면 그 시간은 수업이다.
const PRIORITY: Record<SlotIntent, number> = { basics: 4, interest: 4, free: 3, undecided: 2, safety: 1 }

/** 한 주의 의도별 시간(분). 엔진이 배치한 칸만 센다 — 후보·시각 모르는 칸은 넣지 않는다. */
export const weekIntentMinutes = (days: DayPlan[]): Record<SlotIntent, number> => {
  const totals: Record<SlotIntent, number> = { safety: 0, basics: 0, interest: 0, free: 0, undecided: 0 }
  for (const day of days) {
    const blocks = day.blocks.map((block) => ({ ...block, intent: entryIntent(block.entry) }))
      .filter((block): block is typeof block & { intent: SlotIntent } => block.intent !== null)
    if (!blocks.length) continue
    const from = Math.min(...blocks.map((block) => block.start))
    const to = Math.max(...blocks.map((block) => block.end))
    for (let minute = from; minute < to; minute += 1) {
      let best: SlotIntent | null = null
      for (const block of blocks) {
        if (block.start <= minute && minute < block.end && (best === null || PRIORITY[block.intent] > PRIORITY[best])) best = block.intent
      }
      if (best) totals[best] += 1
    }
  }
  return totals
}

const hours = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`
}

/** "이번 주 안전 10시간 · 관심 2시간". 0인 의도는 뺀다. 아무것도 없으면 null. */
export const describeIntents = (totals: Record<SlotIntent, number>): string | null => {
  const parts = INTENTS.filter((intent) => totals[intent] > 0).map((intent) => `${INTENT_LABELS[intent]} ${hours(totals[intent])}`)
  return parts.length ? `이번 주 ${parts.join(' · ')}` : null
}
