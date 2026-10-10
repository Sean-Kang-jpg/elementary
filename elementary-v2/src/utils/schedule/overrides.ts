import { computeDay, type DayPlan } from './engine.ts'
import type { DayContext, PlanningWindow, ScheduleEntry, ScheduleException, Weekday } from './types'

/**
 * 반복 일정 위의 사용자 수정·일회 변경, 그리고 새 판 학교 자료 반영 (Audit 2 §6.2, A2-S03).
 *
 * 순서는 기본 주간 → 날짜 덮어쓰기(DayContext) → 일정 하나의 일회 변경(ScheduleException)이다.
 * 새 판 자료는 조용히 바꾸지 않는다. 바뀐 점을 제안으로 돌려주고, 부모가 고친 값과 지운
 * 일정은 제안이 덮지 못한다. 저장소의 동시 편집(revision 비교)은 저장이 생기는 S04에서 다룬다.
 */

/** 부모가 고친 시각을 반영한 일정. 지운 일정은 null. */
export const effectiveEntry = (entry: ScheduleEntry): ScheduleEntry | null => {
  const override = entry.userOverride
  if (!override) return entry
  if (override.deleted) return null
  return {
    ...entry,
    start: override.start !== undefined ? override.start : entry.start,
    end: override.end !== undefined ? override.end : entry.end,
  }
}

/** 'YYYY-MM-DD'의 요일. 주말이면 null — 이번 범위는 평일이다. 시간대와 무관하게 계산한다. */
export const weekdayOf = (date: string): Weekday | null => {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()
  return day >= 1 && day <= 5 ? (day as Weekday) : null
}

export interface DatePlan {
  date: string
  plan: DayPlan
  applied: ScheduleException[]
  /** 그날에 없는 일정을 가리키는 변경. 원래 일정이 지워졌거나 요일이 다를 때 생긴다. */
  unmatched: ScheduleException[]
}

/** 특정 날짜의 하루. 주말이면 null. */
export const computeDate = (
  entries: ScheduleEntry[],
  exceptions: ScheduleException[],
  date: string,
  window: PlanningWindow,
  context: DayContext = {},
): DatePlan | null => {
  const weekday = weekdayOf(date)
  if (!weekday) return null
  let today = entries.map(effectiveEntry).filter((entry): entry is ScheduleEntry => entry !== null)
  const applied: ScheduleException[] = []
  const unmatched: ScheduleException[] = []

  for (const exception of exceptions.filter((item) => item.date === date)) {
    const target = today.find((entry) => entry.id === exception.entryId)
    if (exception.kind === 'makeup') {
      // 보강은 원래 일정이 그 요일에 없어도 된다(다른 요일에 하는 보강이 보통이다).
      const original = target ?? entries.map(effectiveEntry).find((entry) => entry?.id === exception.entryId) ?? null
      if (!original) {
        unmatched.push(exception)
        continue
      }
      today = [...today, {
        ...original,
        id: exception.id,
        label: `${original.label} 보강`,
        weekdays: [weekday],
        start: exception.start ?? original.start,
        end: exception.end ?? original.end,
        startsAfterSchool: exception.start != null ? false : original.startsAfterSchool,
      }]
      applied.push(exception)
      continue
    }
    if (!target || !target.weekdays.includes(weekday)) {
      unmatched.push(exception)
      continue
    }
    today = exception.kind === 'cancel'
      ? today.filter((entry) => entry.id !== target.id)
      : today.map((entry) => (entry.id === target.id
        ? {
          ...entry,
          start: exception.start !== undefined ? exception.start : entry.start,
          end: exception.end !== undefined ? exception.end : entry.end,
          startsAfterSchool: exception.start != null ? false : entry.startsAfterSchool,
        }
        : entry))
    applied.push(exception)
  }

  return { date, plan: computeDay(today, weekday, window, context), applied, unmatched }
}

// 새 판 학교 자료 ---------------------------------------------------------

type ComparedField = 'start' | 'end' | 'weekdays' | 'label' | 'evidence'
const COMPARED: ComparedField[] = ['start', 'end', 'weekdays', 'label', 'evidence']
const OVERRIDABLE: ReadonlySet<ComparedField> = new Set(['start', 'end'])

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export type SourceProposal =
  | { kind: 'add'; entry: ScheduleEntry }
  | { kind: 'remove'; entryId: string }
  | { kind: 'change'; entryId: string; field: ComparedField; from: unknown; to: unknown; version: string }
  /** 부모가 고친 필드를 새 판도 바꿨다. 받아들이면 부모 값 대신 새 판 값을 쓴다. */
  | { kind: 'conflict'; entryId: string; field: 'start' | 'end'; userValue: unknown; sourceValue: unknown; version: string }
  /** 부모가 지운 일정이 새 판에서 바뀌었다. 되살리지 않고 알리기만 한다. */
  | { kind: 'kept_deleted'; entryId: string }

/**
 * 같은 출처(source.ref)의 일정 묶음을 새 판과 비교해 제안을 만든다. 현재 일정은 바꾸지 않는다.
 * 부모가 직접 넣은 일정(source 없음)과 다른 출처의 일정은 건드리지 않는다.
 */
export const proposeSourceUpdate = (current: ScheduleEntry[], incoming: ScheduleEntry[]): SourceProposal[] => {
  const refs = new Set(incoming.map((entry) => entry.source?.ref).filter((ref): ref is string => Boolean(ref)))
  const proposals: SourceProposal[] = []
  const currentById = new Map(current.map((entry) => [entry.id, entry]))

  for (const next of incoming) {
    const before = currentById.get(next.id)
    if (!before) {
      proposals.push({ kind: 'add', entry: next })
      continue
    }
    const version = next.source?.version ?? ''
    const changed = COMPARED.filter((field) => !same(before[field], next[field]))
    if (!changed.length) continue
    if (before.userOverride?.deleted) {
      proposals.push({ kind: 'kept_deleted', entryId: before.id })
      continue
    }
    for (const field of changed) {
      const override = before.userOverride
      if (OVERRIDABLE.has(field) && override && override[field as 'start' | 'end'] !== undefined) {
        proposals.push({ kind: 'conflict', entryId: before.id, field: field as 'start' | 'end', userValue: override[field as 'start' | 'end'], sourceValue: next[field], version })
      } else {
        proposals.push({ kind: 'change', entryId: before.id, field, from: before[field], to: next[field], version })
      }
    }
  }

  const incomingIds = new Set(incoming.map((entry) => entry.id))
  for (const entry of current) {
    if (entry.source && refs.has(entry.source.ref) && !incomingIds.has(entry.id) && !entry.userOverride?.deleted) {
      proposals.push({ kind: 'remove', entryId: entry.id })
    }
  }
  return proposals
}

/** 부모가 받아들인 제안만 반영한 새 일정 목록. kept_deleted는 알림이라 반영할 것이 없다. */
export const applyProposals = (current: ScheduleEntry[], accepted: SourceProposal[]): ScheduleEntry[] => {
  let entries = [...current]
  for (const proposal of accepted) {
    if (proposal.kind === 'add') {
      if (!entries.some((entry) => entry.id === proposal.entry.id)) entries = [...entries, proposal.entry]
    } else if (proposal.kind === 'remove') {
      entries = entries.filter((entry) => entry.id !== proposal.entryId)
    } else if (proposal.kind === 'change' || proposal.kind === 'conflict') {
      entries = entries.map((entry) => {
        if (entry.id !== proposal.entryId) return entry
        const value = proposal.kind === 'change' ? proposal.to : proposal.sourceValue
        const next: ScheduleEntry = { ...entry, [proposal.field]: value }
        if (entry.source) next.source = { ...entry.source, version: proposal.version }
        if (proposal.kind === 'conflict' && entry.userOverride) {
          // 새 판 값을 받아들였으니 그 필드의 부모 수정은 거둔다.
          const override = { ...entry.userOverride }
          delete override[proposal.field]
          next.userOverride = Object.keys(override).length ? override : undefined
        }
        return next
      })
    }
  }
  return entries
}
