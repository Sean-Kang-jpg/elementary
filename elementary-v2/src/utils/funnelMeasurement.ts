import type { PlanFace } from './familyPlanCore.ts'

export const MEASUREMENT_VERSION = 'fnl-1'
export type FunnelParams = Record<string, string | number | undefined>
export type SelectionMethod = 'user' | 'route' | 'restore'
type EntryPoint = 'link' | 'home' | 'guide' | 'school_detail' | 'apartment_detail' | 'my' | 'frontyard' | 'timetable' | 'nav'

export interface MeasuredScreen {
  pathname: string
  search: string
  pageLocation: string
  pageTitle: string
  /** Actual displayed state, including the default face and restored school. */
  timetable?: { face: PlanFace; schoolId: string | null; schoolReady: boolean; selectionMethod: SelectionMethod }
}

/** Tracking parameters alone must not turn a rerender into a new screen. */
export const measurementScreenKey = (pathname: string, search: string, timetable?: MeasuredScreen['timetable']): string => {
  if (timetable) return `/timetable?face=${timetable.face}&school=${timetable.face === 'week' ? timetable.schoolId ?? '' : ''}`
  const query = new URLSearchParams(search)
  const year = query.get('year')
  return (pathname.startsWith('/guide') || pathname === '/faq') && year && /^20\d{2}$/.test(year)
    ? `${pathname}?year=${year}` : pathname
}

const entryPointOf = (path?: string): EntryPoint => {
  if (!path) return 'link'
  if (path === '/') return 'home'
  if (path.startsWith('/school/')) return 'school_detail'
  if (path.startsWith('/apt/')) return 'apartment_detail'
  if (path.startsWith('/guide') || path === '/faq') return 'guide'
  if (path === '/my' || path === '/frontyard' || path === '/timetable') return path.slice(1) as EntryPoint
  return 'nav'
}

/** Legacy local IDs and arbitrary query text are never transmitted as school IDs. */
const publicSchool = (id: string | null): FunnelParams => id && /^B\d+$/i.test(id) ? { school_id: id.toUpperCase() } : {}

/**
 * One observer per document, independent of React mounts. No new storage keys.
 * first_edit is once per school per document; GA4 reports must deduplicate sessions,
 * since a reload can repeat it within one GA4 session.
 */
export const createFunnelMeasurement = (send: (event: string, params: FunnelParams) => void, now = Date.now) => {
  let lastScreen: { key: string; pathname: string } | null = null
  let lastSelectedScreen: string | null = null
  let entryPoint: EntryPoint = 'link'
  let pending: { schoolId: string; method: SelectionMethod; at: number } | null = null
  const editedSchools = new Set<string>()
  const emit = (event: string, params: FunnelParams) => {
    // An unavailable analytics transport must never make a successful save fail.
    try { send(event, { ...params, measurement_version: MEASUREMENT_VERSION }) } catch { /* Measurement is best effort. */ }
  }
  return {
    markSelection(schoolId: string, method: SelectionMethod) { pending = { schoolId, method, at: now() } },
    screen(screen: MeasuredScreen) {
      const timetable = screen.timetable
      const key = measurementScreenKey(screen.pathname, screen.search, timetable)
      if (lastScreen?.key !== key) {
        entryPoint = entryPointOf(lastScreen?.pathname)
        lastScreen = { key, pathname: screen.pathname }
        lastSelectedScreen = null
        emit('page_view', { page_location: screen.pageLocation, page_title: screen.pageTitle, ...(timetable ? { face: timetable.face } : {}) })
        if (timetable) emit('timetable_view', { face: timetable.face, entry_point: entryPoint, ...publicSchool(timetable.face === 'week' ? timetable.schoolId : null) })
      }
      if (timetable?.face === 'week' && timetable.schoolId && timetable.schoolReady && lastSelectedScreen !== key) {
        const mark = pending
        pending = null
        const method = mark?.schoolId === timetable.schoolId && now() - mark.at < 15_000 ? mark.method : timetable.selectionMethod
        lastSelectedScreen = key
        emit('timetable_school_pick', { face: 'week', entry_point: entryPoint, selection_method: method, ...publicSchool(timetable.schoolId) })
      }
    },
    write<T>(schoolId: string, operation: 'create' | 'edit', write: () => T): T {
      const params = { face: 'week', entry_point: entryPoint, ...publicSchool(schoolId) }
      if (operation === 'edit' && !editedSchools.has(schoolId)) {
        editedSchools.add(schoolId)
        emit('timetable_first_edit', params)
      }
      let result: T
      try { result = write() } catch (error) {
        emit('timetable_save_failure', { ...params, operation, error_code: 'storage_write' })
        throw error
      }
      emit(operation === 'create' ? 'timetable_draft_create' : 'timetable_save_success', params)
      return result
    },
  }
}
