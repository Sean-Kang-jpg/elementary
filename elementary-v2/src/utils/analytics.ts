/**
 * GA4, set up for an app whose screens change without a page load.
 *
 * The contract is docs/product/MEASUREMENT_PLAN.md. Two rules from it shape this
 * file:
 *
 * - **No automatic page views** (`send_page_view: false`). GA4 counts a page view
 *   when a document loads, and this app loads one document per visit, so ten
 *   schools viewed would record as one page. App.tsx sends page_view itself after
 *   every address change.
 * - **`entry_source` on every detail view**, which is how ADR-006 is judged: a
 *   rise in `link` entries is the evidence that prerendered detail pages bring
 *   people in. The component that starts a selection marks where it came from
 *   just before dispatching; App.tsx reads the mark when the detail opens.
 *
 * Nothing is sent from anywhere but the production host, or from an automated
 * browser. The public smoke runs against production with a headless browser,
 * and without that guard every release would add sessions that did nothing.
 */

const MEASUREMENT_ID = 'G-NQT4XV9R00'
const PRODUCTION_HOSTS = new Set(['wherecho.co.kr'])

/**
 * How a detail or guide was reached. The first five are MEASUREMENT_PLAN's; `home`,
 * `guides` and `nav` were added with the guides (section 8): the home's guide links,
 * the guide list, and the bottom navigation.
 */
export type EntrySource = 'map' | 'search' | 'link' | 'related' | 'favorites' | 'home' | 'guides' | 'nav' | 'detail'

type Params = Record<string, string | number | undefined>

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    __ANALYTICS_LOG__?: Array<{ event: string; params: Params }>
  }
}

/**
 * `localStorage['wherecho:analytics-debug'] = '1'` records events to
 * `window.__ANALYTICS_LOG__` instead of sending them, on any host and in an
 * automated browser too. It is how the event wiring is checked without either
 * polluting the real property or being blocked by the guards below.
 */
const debugMode = (): boolean => {
  try {
    return window.localStorage.getItem('wherecho:analytics-debug') === '1'
  } catch {
    return false
  }
}

const enabled = (): boolean =>
  typeof window !== 'undefined'
  && PRODUCTION_HOSTS.has(window.location.hostname)
  && !navigator.webdriver

let started = false

let debugging = false

export const initAnalytics = (): void => {
  if (started) return
  if (debugMode()) {
    started = true
    debugging = true
    window.__ANALYTICS_LOG__ = []
    return
  }
  if (!enabled()) return
  started = true
  window.dataLayer = window.dataLayer || []
  // gtag.js reads the arguments object itself, so this must stay a function that
  // pushes `arguments`, not an arrow function that pushes an array.
  window.gtag = function gtag() {
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false })
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
  document.head.appendChild(script)
}

export const track = (event: string, params: Params = {}): void => {
  if (!started) return
  if (debugging) {
    window.__ANALYTICS_LOG__?.push({ event, params })
    return
  }
  window.gtag?.('event', event, params)
}

export const trackPageView = (): void => {
  track('page_view', {
    page_location: window.location.href,
    page_title: document.title,
  })
}

/**
 * A mark that no detail consumed - the same school picked again, a lookup that
 * found nothing - must not be credited to the next, unrelated selection. Restoring
 * a linked address waits on Supabase, so the window is generous but not open-ended.
 */
const ENTRY_MARK_TTL_MS = 15_000

let pendingEntry: { source: EntrySource; at: number } | null = null

/** Called by whatever starts a selection, immediately before it dispatches. */
export const markEntry = (source: EntrySource): void => {
  pendingEntry = { source, at: Date.now() }
}

/**
 * The source of the detail that just opened. An unmarked selection came from a
 * marker on the map, which is the one path with no other caller to mark it.
 */
export const takeEntry = (fallback: EntrySource = 'map'): EntrySource => {
  const mark = pendingEntry
  pendingEntry = null
  return mark && Date.now() - mark.at < ENTRY_MARK_TTL_MS ? mark.source : fallback
}

let detailEntry: EntrySource | null = null

/** Remembered when a detail view is recorded, so actions inside it can say how it was reached. */
export const rememberDetailEntry = (source: EntrySource): void => {
  detailEntry = source
}

export const currentDetailEntry = (): EntrySource | null => detailEntry

/** The key after the last `--` in a detail path: a school_id or a complex public key. */
export const itemOfPath = (path: string): { item_type: 'school' | 'apartment' | 'guide' | 'learn' | 'faq' | 'checklist'; item_id: string } | null => {
  const match = path.match(/^\/(school|apt)\/(?:.*--)?([^/]+)$/)
  if (match) return { item_type: match[1] === 'school' ? 'school' : 'apartment', item_id: match[2] }
  // Content pages, shared since 2026-10-04: a guide by its slug, the FAQ and the
  // checklist as single pages. Only the address is shared - checklist ticks stay
  // on the device that made them.
  const guide = path.match(/^\/guide\/([^/]+)$/)
  if (guide) return { item_type: 'guide', item_id: guide[1] }
  const learn = path.match(/^\/learn\/([^/]+)$/)
  if (learn) return { item_type: 'learn', item_id: learn[1] }
  if (path === '/faq') return { item_type: 'faq', item_id: 'faq' }
  if (path === '/checklist') return { item_type: 'checklist', item_id: 'checklist' }
  return null
}
