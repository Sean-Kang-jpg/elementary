/**
 * What a family should do this month, from the roadmap content and their profile.
 *
 * The admission stage is keyed by calendar month (September before entry through
 * March), because its deadlines are calendar dates fixed by the decree - the
 * 31 December deferral cutoff, the 30 November zone decision, the 20 December
 * notice. The planning stage has no deadlines, so it is one list.
 */
import roadmap from '../content/roadmap.json'
import { stageOf, type Stage } from './entryYear'
import type { Profile } from './profile'

export interface RoadmapTask {
  id: string
  text: string
  link?: string
  /** Shown only to families interested in private or national schools, or planning a move. */
  only?: 'private' | 'moving'
  /** Planning tasks that matter only in some months, such as the early-entry window. */
  onlyMonths?: number[]
}

const ADMISSION = roadmap.admission as Record<string, RoadmapTask[]>
const PLANNING = roadmap.planning as RoadmapTask[]

export const ENTRY_DAY_NOTE = roadmap.entryDay.note
export const ROADMAP_VERIFIED_AT = roadmap.verifiedAt

/** Days until the usual entry day. Approximate: each school sets its own date. */
export const daysToEntry = (entryYear: number, now = new Date()): number => {
  const entry = new Date(entryYear, roadmap.entryDay.month - 1, roadmap.entryDay.day)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((entry.getTime() - today.getTime()) / 86_400_000))
}

const applies = (task: RoadmapTask, profile: Profile, month: number): boolean => {
  if (task.only === 'private' && !profile.interest.includes('private')) return false
  if (task.only === 'moving' && profile.moving === 'none') return false
  if (task.onlyMonths && !task.onlyMonths.includes(month)) return false
  return true
}

export interface RoadmapView {
  stage: Stage
  month: number
  now: RoadmapTask[]
  /** Every month after this one through March of entry, so a family sees the whole run-up. */
  upcoming: Array<{ month: number; tasks: RoadmapTask[] }>
}

export const roadmapFor = (entryYear: number, profile: Profile, now = new Date()): RoadmapView => {
  const stage = stageOf(entryYear, now)
  const month = now.getMonth() + 1
  if (stage === 'planning') {
    return { stage, month, now: PLANNING.filter((task) => applies(task, profile, month)), upcoming: [] }
  }
  const upcoming: RoadmapView['upcoming'] = []
  for (let next = month === 12 ? 1 : month + 1; month !== 3; next = next === 12 ? 1 : next + 1) {
    const tasks = (ADMISSION[String(next)] ?? []).filter((task) => applies(task, profile, next))
    if (tasks.length) upcoming.push({ month: next, tasks })
    if (next === 3) break
  }
  return {
    stage,
    month,
    now: (ADMISSION[String(month)] ?? []).filter((task) => applies(task, profile, month)),
    upcoming,
  }
}
