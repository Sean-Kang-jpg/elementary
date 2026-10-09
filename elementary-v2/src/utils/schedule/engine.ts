import type { DayContext, EvidenceStatus, Minutes, ParticipationStatus, PlanningWindow, ScheduleEntry, TransitionRule, Weekday } from './types'

/**
 * 초1 시간표 계산 엔진 (Audit 2 §6.2, A2-S02). 순수 함수만 둔다 — 저장·화면·네트워크 없음.
 *
 * 계산 규칙:
 * - 구간은 [start, end)다. 13:40에 끝나고 13:40에 시작하면 겹침이 아니라 이어짐이다.
 * - 점유 시간은 '들어가는' 일정만의 합집합이다. 고민 중(considering)·탈락·취소는 후보로만 보인다.
 * - 시각을 모르는 일정은 배치하지 않는다(unplaced). 그 일정이 오후 구간에 걸칠 수 있으면
 *   공백은 'uncertain'이고, 하교 시각 자체를 모르면 공백 분을 아예 내지 않는다.
 * - 확정 공백과 예상 공백을 섞지 않는다. 경계 양쪽이 확정이어야 confirmed다.
 */

const OCCUPYING: ReadonlySet<ParticipationStatus> = new Set(['planned', 'applying', 'confirmed'])
const EXCLUDED: ReadonlySet<ParticipationStatus> = new Set(['rejected', 'cancelled'])
const FIRM_EVIDENCE: ReadonlySet<EvidenceStatus> = new Set(['confirmed', 'school-plan'])

/** 정규수업 시작 시각을 모를 때 쓰는 가정값. 1교시는 대개 08:40~09:10에 시작한다. */
export const ASSUMED_SCHOOL_START: Minutes = 9 * 60

export interface PlacedBlock {
  entry: ScheduleEntry
  start: Minutes
  end: Minutes
  /** 신청 전·결과 전이라 아직 확정이 아니다. */
  tentative: boolean
}

export type UnplacedReason = 'time_unknown' | 'dismissal_unknown'

export interface Overlap {
  a: PlacedBlock
  b: PlacedBlock
  from: Minutes
  to: Minutes
  /** 돌봄 중 방과후 수업에 다녀오는 것은 흔한 일정이라 충돌과 구분한다. */
  type: 'care_afterschool' | 'conflict'
}

export interface TransitionCheck {
  from: PlacedBlock
  to: PlacedBlock
  rule: Exclude<TransitionRule, 'confirmed'>
}

export interface Gap {
  from: Minutes
  to: Minutes
  minutes: number
  status: 'confirmed' | 'estimated' | 'uncertain'
}

export type GapsUndeterminedReason = 'dismissal_unknown' | 'no_school_day'

export interface DayPlan {
  weekday: Weekday
  dismissal: { at: Minutes | null; evidence: EvidenceStatus }
  blocks: PlacedBlock[]
  unplaced: Array<{ entry: ScheduleEntry; reason: UnplacedReason }>
  candidates: PlacedBlock[]
  excluded: ScheduleEntry[]
  overlaps: Overlap[]
  transitions: TransitionCheck[]
  window: { from: Minutes; to: Minutes } | null
  /** window가 null이면 공백을 계산하지 않았다는 뜻이다. 빈 배열(빈 시간 없음)과 다르다. */
  gaps: Gap[]
  gapsUndetermined: GapsUndeterminedReason | null
}

const activeOn = (entry: ScheduleEntry, weekday: Weekday, context: DayContext): boolean => {
  if (!entry.weekdays.includes(weekday)) return false
  const term = entry.term ?? 'both'
  if (context.vacation) return term !== 'semester'
  return term !== 'vacation'
}

const resolveDismissal = (entries: ScheduleEntry[], context: DayContext): DayPlan['dismissal'] => {
  if (context.vacation) return { at: null, evidence: 'unknown' }
  if (context.dismissalOverride !== undefined) return { at: context.dismissalOverride, evidence: 'confirmed' }
  const school = entries.find((entry) => entry.kind === 'school')
  if (!school) return { at: null, evidence: 'unknown' }
  return { at: school.end, evidence: school.end === null ? 'unknown' : school.evidence }
}

/** 학교 일정의 끝은 그날의 하교로 맞춘다(단축수업 덮어쓰기 반영). */
const placeEntry = (entry: ScheduleEntry, dismissal: Minutes | null): { start: Minutes; end: Minutes } | UnplacedReason => {
  if (entry.kind === 'school') {
    if (dismissal === null) return 'dismissal_unknown'
    // 시작 시각은 자료에 없다(SQL 26은 하교만 싣는다). 오후 계산에는 끝만 쓰이고, 시작은
    // 오전 일정과의 겹침 판정에만 쓰이므로 가정값을 둔다 — 아침돌봄(~08:40)을 충돌로 잡지 않게.
    return { start: entry.start ?? ASSUMED_SCHOOL_START, end: dismissal }
  }
  const start = entry.startsAfterSchool ? dismissal : entry.start
  if (entry.startsAfterSchool && dismissal === null) return 'dismissal_unknown'
  if (start === null || entry.end === null) return 'time_unknown'
  if (entry.end <= start) return 'time_unknown'
  return { start, end: entry.end }
}

const isFirm = (block: PlacedBlock): boolean => !block.tentative && FIRM_EVIDENCE.has(block.entry.evidence)

export const computeDay = (
  entries: ScheduleEntry[],
  weekday: Weekday,
  window: PlanningWindow,
  context: DayContext = {},
): DayPlan => {
  const today = entries.filter((entry) => activeOn(entry, weekday, context))
  const dismissal = resolveDismissal(today, context)

  const blocks: PlacedBlock[] = []
  const candidates: PlacedBlock[] = []
  const unplaced: DayPlan['unplaced'] = []
  const excluded: ScheduleEntry[] = []

  for (const entry of today) {
    if (EXCLUDED.has(entry.participation)) {
      excluded.push(entry)
      continue
    }
    const placed = placeEntry(entry, dismissal.at)
    const occupying = OCCUPYING.has(entry.participation)
    if (typeof placed === 'string') {
      // 고민 중인 후보의 시각을 모르는 것은 계산에 영향이 없다. 들어가는 일정만 미배치로 알린다.
      if (occupying) unplaced.push({ entry, reason: placed })
      continue
    }
    const block: PlacedBlock = { entry, ...placed, tentative: entry.participation !== 'confirmed' }
    if (occupying) blocks.push(block)
    else candidates.push(block)
  }

  const byTime = (a: PlacedBlock, b: PlacedBlock) => a.start - b.start || a.end - b.end
  blocks.sort(byTime)
  candidates.sort(byTime)

  const overlaps: Overlap[] = []
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i]
      const b = blocks[j]
      const from = Math.max(a.start, b.start)
      const to = Math.min(a.end, b.end)
      if (from >= to) continue
      const kinds = new Set([a.entry.kind, b.entry.kind])
      const type = kinds.size === 2 && kinds.has('care') && kinds.has('afterschool') ? 'care_afterschool' : 'conflict'
      overlaps.push({ a, b, from, to, type })
    }
  }

  // 바로 이어지는 두 일정 사이의 이동. 확인되지 않은 이동은 '학교 확인 필요', 금지면 충돌이다.
  const transitions: TransitionCheck[] = []
  for (const to of blocks) {
    const rule = to.entry.transitionIn ?? 'unknown'
    if (rule === 'confirmed') continue
    const from = blocks.find((block) => block !== to && block.end === to.start)
    if (from) transitions.push({ from, to, rule })
  }

  const base = { weekday, dismissal, blocks, unplaced, candidates, excluded, overlaps, transitions }

  const windowFrom = window.from === 'dismissal' ? dismissal.at : window.from
  if (windowFrom === null) {
    return { ...base, window: null, gaps: [], gapsUndetermined: context.vacation ? 'no_school_day' : 'dismissal_unknown' }
  }
  if (window.to <= windowFrom) return { ...base, window: { from: windowFrom, to: window.to }, gaps: [], gapsUndetermined: null }

  // 오후 구간의 앞 경계가 하교라면 그 확실성은 하교 시각의 확실성이다.
  const windowStartFirm = window.from !== 'dismissal' || FIRM_EVIDENCE.has(dismissal.evidence)
  const uncertain = unplaced.length > 0

  const gaps: Gap[] = []
  let cursor = windowFrom
  let cursorFirm = windowStartFirm
  const push = (from: Minutes, to: Minutes, endFirm: boolean) => {
    if (to <= from) return
    const status = uncertain ? 'uncertain' : cursorFirm && endFirm ? 'confirmed' : 'estimated'
    gaps.push({ from, to, minutes: to - from, status })
  }
  for (const block of blocks) {
    if (block.end <= cursor) continue
    if (block.start >= window.to) break
    push(cursor, Math.min(block.start, window.to), isFirm(block))
    if (block.end > cursor) {
      cursor = block.end
      cursorFirm = isFirm(block)
    }
  }
  push(cursor, window.to, true)

  return { ...base, window: { from: windowFrom, to: window.to }, gaps, gapsUndetermined: null }
}

export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5]

export const computeWeek = (
  entries: ScheduleEntry[],
  window: PlanningWindow,
  contexts: Partial<Record<Weekday, DayContext>> = {},
): DayPlan[] => WEEKDAYS.map((weekday) => computeDay(entries, weekday, window, contexts[weekday]))
