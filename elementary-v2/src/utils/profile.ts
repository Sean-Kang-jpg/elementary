/**
 * The family's entry profile and checklist, kept on this device only (PRD v2 D1,
 * option A, decided 2026-10-03). Nothing here is sent anywhere; the privacy
 * policy says so in its section on device storage.
 *
 * Every read and write tolerates storage being unavailable - private windows and
 * blocked site data throw - and the page works without it.
 */

export type SchoolInterest = 'public' | 'private'
export type MovingPlan = 'none' | 'considering' | 'planned'

export interface Profile {
  entryYear: number | null
  interest: SchoolInterest[]
  moving: MovingPlan
}

const PROFILE_KEY = 'wherecho:profile-v1'
const CHECKLIST_KEY = 'wherecho:checklist-v1'
const CHANGE_EVENT = 'wherecho:profile-change'

export const EMPTY_PROFILE: Profile = { entryYear: null, interest: ['public'], moving: 'none' }

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

const write = (key: string, value: unknown): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked: the choice still holds for this visit, in memory.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export const readProfile = (): Profile => read(PROFILE_KEY, EMPTY_PROFILE)

/** True once the family has saved anything, which is when start_profile_created is sent. */
export const hasSavedProfile = (): boolean => {
  try {
    return window.localStorage.getItem(PROFILE_KEY) !== null
  } catch {
    return false
  }
}

export const saveProfile = (profile: Profile): void => write(PROFILE_KEY, profile)

export const readChecklist = (): Record<string, boolean> => read<Record<string, boolean>>(CHECKLIST_KEY, {})

export const saveChecklist = (state: Record<string, boolean>): void => write(CHECKLIST_KEY, state)

export const subscribeProfile = (listener: () => void): (() => void) => {
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}

const READ_GUIDES_KEY = 'wherecho:read-guides-v1'

/** Guides opened on this device, for the hub's "n/9 읽음". Same storage rules as above. */
export const readGuides = (): string[] => {
  try {
    const raw = window.localStorage.getItem(READ_GUIDES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

export const markGuideRead = (slug: string): void => {
  const current = readGuides()
  if (current.includes(slug)) return
  write(READ_GUIDES_KEY, [...current, slug])
}
