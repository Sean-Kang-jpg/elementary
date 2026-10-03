/**
 * The child's school entry year, and which stage of the guides it puts a family in.
 *
 * Parents are asked for the entry year (with the birth year beside it) rather than
 * an age, because "5세" is read as either international or Korean age. A child
 * enters in March of the year after they turn 6, so entry year = birth year + 7.
 *
 * Kept in the URL (`?year=2028`) and in memory only - it needs no device storage,
 * so it does not wait on PRD v2 decision D1.
 */

import structure from '../content/structure.json'

export type Stage = 'planning' | 'admission'

/** The three entry years a family can still be preparing for. */
export const entryYears = (now = new Date()): number[] => {
  // After March the current year's intake has entered, so the next intake leads.
  const first = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear()
  return [first, first + 1, first + 2]
}

export const birthYearOf = (entryYear: number): number => entryYear - 7

/**
 * `admission` from 1 September of the year before entry - the autumn private
 * school applications open - until entry. Before that, `planning`.
 */
export const stageOf = (entryYear: number, now = new Date()): Stage =>
  now >= new Date(entryYear - 1, 8, 1) ? 'admission' : 'planning'

export const STAGE_LABELS = structure.stages as Record<Stage, { short: string; long: string; homeTitle: string }>

export const readEntryYear = (search = typeof window === 'undefined' ? '' : window.location.search): number | null => {
  const year = Number(new URLSearchParams(search).get('year'))
  return entryYears().includes(year) ? year : null
}
