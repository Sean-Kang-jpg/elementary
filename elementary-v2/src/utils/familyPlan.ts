/**
 * 우리집 일정: 화면이 부르는 단 하나의 창구(UX_BACKLOG_PLAN_CENTERED.md UX-K0).
 *
 * 일정은 새 저장소를 크게 만들지 않고 이미 있는 기기 저장값 위에 선다.
 * - 입학까지 = 프로필(`wherecho:profile-v1`)로 거른 로드맵 + 사용자가 담은 항목, 완료는 체크리스트(`wherecho:checklist-v1`)
 * - 우리 아이 한 주 = 학교별 시간표 초안(`elementary-schedule-plans-v1`, schedule/plans.ts)
 * 새로 저장하는 것은 담은 항목과 시작·방문 기록뿐이다(`wherecho:family-plan-v1`). 모두 이 기기에만 있다(D1).
 *
 * 화면은 저장 키를 직접 읽거나 쓰지 않고 이 파일의 함수만 부른다. 이벤트 plan_start·plan_item_add·plan_return도
 * 여기서만 보낸다 — 화면마다 보내면 "처음 한 번"을 지킬 수 없다.
 */
import { track } from './analytics'
import { readChecklist, readProfile, hasSavedProfile, saveChecklist, subscribeProfile } from './profile'
import { roadmapFor } from './roadmap'
import { readPlans, subscribePlans } from './schedule/plans'
import { daysSince, mergeTimeline, validPinned, type PinnedItem, type PlanFace, type PlanSource, type TimelineEntry } from './familyPlanCore'

export type { PinnedItem, PlanFace, PlanSource, TimelineEntry, TimelineWhen } from './familyPlanCore'
export { nextDateOf } from './familyPlanCore'

const KEY = 'wherecho:family-plan-v1'
const EVENT = 'wherecho:family-plan-change'

interface FamilyPlanStore {
  version: 1
  startedAt: string | null
  startedFrom: PlanSource | null
  lastSeenAt: string | null
  pinned: PinnedItem[]
}

const empty = (): FamilyPlanStore => ({ version: 1, startedAt: null, startedFrom: null, lastSeenAt: null, pinned: [] })

const readStore = (): FamilyPlanStore => {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || 'null') as Partial<FamilyPlanStore> | null
    if (!value || value.version !== 1) return empty()
    return {
      version: 1,
      startedAt: typeof value.startedAt === 'string' ? value.startedAt : null,
      startedFrom: typeof value.startedFrom === 'string' ? value.startedFrom : null,
      lastSeenAt: typeof value.lastSeenAt === 'string' ? value.lastSeenAt : null,
      pinned: Array.isArray(value.pinned) ? value.pinned.filter(validPinned) : [],
    }
  } catch {
    return empty()
  }
}

/** 저장에 실패하면 false. 담기 버튼은 이때 담겼다고 보이면 안 된다. */
const writeStore = (store: FamilyPlanStore): boolean => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    return false
  }
  window.dispatchEvent(new Event(EVENT))
  return true
}

/**
 * 이 기기에 우리집 일정이 있는가. 이 파일 이전부터 입학연도를 저장했거나 시간표 초안을 만든 가족도 일정이 있는 것으로 본다 —
 * 그들에게 plan_start를 다시 보내면 신규 시작이 부풀려진다.
 */
export const hasFamilyPlan = (): boolean => {
  const store = readStore()
  if (store.startedAt || store.pinned.length) return true
  if (hasSavedProfile() && readProfile().entryYear !== null) return true
  return readPlans().plans.length > 0
}

export interface StartOptions {
  from: PlanSource
  face: PlanFace
  /** 가이드 slug, 고민 id, 학교 id처럼 어디서 시작했는지. 주소·자유 입력은 넣지 않는다. */
  contentId?: string
}

/** 일정을 시작한다. 처음일 때만 plan_start를 보낸다. 이미 있으면 아무것도 하지 않는다. */
export const startFamilyPlan = ({ from, face, contentId }: StartOptions): void => {
  const isNew = !hasFamilyPlan()
  const store = readStore()
  if (store.startedAt) return
  const now = new Date().toISOString()
  if (!writeStore({ ...store, startedAt: now, startedFrom: from, lastSeenAt: now })) return
  if (isNew) track('plan_start', { from, content_id: contentId, face })
}

export const isInPlan = (id: string): boolean => readStore().pinned.some((item) => item.id === id)

/**
 * 홈 고민·시즌 항목·가이드에서 "내 일정에 넣기". 일정이 없으면 이것이 시작이다.
 * 같은 id를 다시 담으면 내용만 새로 쓰고 이벤트는 보내지 않는다.
 */
export const addToPlan = (item: Omit<PinnedItem, 'addedAt'>, options: Omit<StartOptions, 'face'>): boolean => {
  if (!validPinned({ ...item, addedAt: '' })) return false
  startFamilyPlan({ ...options, face: 'timeline' })
  const store = readStore()
  const existing = store.pinned.find((pinned) => pinned.id === item.id)
  const next: PinnedItem = { ...item, addedAt: existing?.addedAt ?? new Date().toISOString() }
  const saved = writeStore({ ...store, pinned: [next, ...store.pinned.filter((pinned) => pinned.id !== item.id)] })
  if (saved && !existing) track('plan_item_add', { item_id: item.id, from: options.from })
  return saved
}

export const removeFromPlan = (id: string): boolean => {
  const store = readStore()
  if (!store.pinned.some((item) => item.id === id)) return true
  return writeStore({ ...store, pinned: store.pinned.filter((item) => item.id !== id) })
}

/** 입학까지 면. 입학연도가 없으면 로드맵 없이 담은 항목만. */
export const readTimeline = (now = new Date()): TimelineEntry[] => {
  const profile = readProfile()
  const roadmap = profile.entryYear === null ? null : roadmapFor(profile.entryYear, profile, now)
  return mergeTimeline(roadmap, readStore().pinned, readChecklist(), now)
}

/** 일정 항목 완료 표시. 체크리스트와 같은 저장값이라 체크리스트 화면에도 그대로 보인다. */
export const setTimelineDone = (id: string, done: boolean): void => {
  const checked = readChecklist()
  if (done) checked[id] = true
  else delete checked[id]
  saveChecklist(checked)
}

let visitNoted = false

/**
 * 우리집 일정·홈의 일정 카드가 열릴 때 부른다. 페이지를 새로 읽을 때마다 한 번만 센다(이 앱은 방문당 문서 하나).
 * 하루 이상 지나 다시 왔으면 plan_return. 방문 시각은 일정이 있을 때만 남긴다.
 */
export const notePlanVisit = (now = new Date()): void => {
  if (visitNoted || !hasFamilyPlan()) return
  visitNoted = true
  const store = readStore()
  const days = daysSince(store.lastSeenAt, now)
  writeStore({ ...store, lastSeenAt: now.toISOString() })
  if (days !== null && days >= 1) track('plan_return', { days_since: days })
}

/** 일정이 바뀌면 부른다: 담은 항목, 프로필·체크리스트, 시간표 초안 어느 쪽이든. */
export const subscribeFamilyPlan = (listener: () => void): (() => void) => {
  window.addEventListener(EVENT, listener)
  const offProfile = subscribeProfile(listener)
  const offPlans = subscribePlans(listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    offProfile()
    offPlans()
  }
}
