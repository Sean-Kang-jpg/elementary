import type { ScheduleEntry, Weekday } from './types'
import type { SchoolPlan } from './plans'

/** 앞마당 글의 시간 한 칸. 'HH:MM'. */
export interface PostSlot { weekday: number; start: string; end: string }

const minutes = (value: string): number => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))

export type AddPostResult =
  | { ok: true; plan: SchoolPlan; added: number }
  | { ok: false; reason: 'nothing' | 'exists' }

/**
 * [모집해요] 글을 내 시간표에 '검토 중' 일정으로 담는다. 학원 신청이나 예약이 아니다.
 *
 * 시간이 같은 요일끼리 한 일정으로 묶는다(월·수 14:00~15:00 → 한 줄). 평일만 담는다 — 시간표가
 * 월~금이다. 직접 입력한 일정과 똑같이 고치고 지울 수 있게 source는 두지 않고 글 ID만 남긴다.
 * 같은 글을 이미 담았으면 다시 담지 않는다.
 */
export const addPostToPlan = (
  plan: SchoolPlan,
  post: { post_id: string; title: string; provider_name: string | null; time_slots: PostSlot[] },
  newId: () => string,
  now = new Date(),
): AddPostResult => {
  if (plan.entries.some((entry) => entry.frontyardPostId === post.post_id)) return { ok: false, reason: 'exists' }
  const groups = new Map<string, { start: number; end: number; weekdays: Weekday[] }>()
  for (const slot of post.time_slots) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 5) continue
    const start = minutes(slot.start)
    const end = minutes(slot.end)
    if (!(start < end)) continue
    const key = `${start}-${end}`
    const group = groups.get(key) ?? { start, end, weekdays: [] }
    if (!group.weekdays.includes(slot.weekday as Weekday)) group.weekdays.push(slot.weekday as Weekday)
    groups.set(key, group)
  }
  if (!groups.size) return { ok: false, reason: 'nothing' }
  const label = (post.provider_name ? `${post.provider_name} · ${post.title}` : post.title).slice(0, 80)
  const entries: ScheduleEntry[] = [...groups.values()].map((group) => ({
    id: newId(),
    kind: 'personal',
    label,
    weekdays: [...group.weekdays].sort((a, b) => a - b),
    start: group.start,
    end: group.end,
    startsAfterSchool: false,
    evidence: 'estimated',
    participation: 'considering',
    transitionIn: 'unknown',
    term: 'semester',
    frontyardPostId: post.post_id,
  }))
  return { ok: true, added: entries.length, plan: { ...plan, updatedAt: now.toISOString(), entries: [...plan.entries, ...entries] } }
}

export interface AcademyEntryDraft {
  label: string
  providerKey?: string
  weekdays: number[]
  start: number
  end: number
  /** 실제로 다니는 중이면 '확정', 아니면 '검토 중'. 기획서의 예상/실제 이용 구분이다. */
  attending: boolean
}

/**
 * 지도에서 고른 학원을 부모가 아는 요일·시간으로 담는다(인수인계서 4.1 Case B). 공식 시간표가 없어도 된다.
 * 학원 공식 정보로 쓰지 않는다 — 이 일정은 기기(나중에 서버)의 개인 시간표에만 있다.
 * 요일마다 시간이 다르면 요일을 나눠 여러 번 담는다.
 */
export const addAcademyToPlan = (plan: SchoolPlan, draft: AcademyEntryDraft, newId: () => string, now = new Date()):
  { ok: true; plan: SchoolPlan; entry: ScheduleEntry } | { ok: false; reason: 'invalid' } => {
  const weekdays = [...new Set(draft.weekdays)].filter((day): day is Weekday => Number.isInteger(day) && day >= 1 && day <= 5).sort((a, b) => a - b)
  const label = draft.label.trim().slice(0, 80)
  if (!label || !weekdays.length || !Number.isInteger(draft.start) || !Number.isInteger(draft.end)
    || draft.start < 0 || draft.end >= 1440 || draft.start >= draft.end) return { ok: false, reason: 'invalid' }
  const entry: ScheduleEntry = {
    id: newId(),
    kind: 'personal',
    label,
    weekdays,
    start: draft.start,
    end: draft.end,
    startsAfterSchool: false,
    evidence: 'estimated',
    participation: draft.attending ? 'confirmed' : 'considering',
    transitionIn: 'unknown',
    term: 'semester',
    ...(draft.providerKey ? { providerKey: draft.providerKey } : {}),
  }
  return { ok: true, entry, plan: { ...plan, updatedAt: now.toISOString(), entries: [...plan.entries, entry] } }
}
