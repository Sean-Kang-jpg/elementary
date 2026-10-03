import type { MouseEvent } from 'react'

/**
 * Route clicks on links inside rendered content through the app instead of a
 * full page load. External links and modified clicks (new tab, etc.) are left to
 * the browser.
 */
export const followInternalLink = (
  event: MouseEvent<HTMLElement>,
  onNavigate: (path: string) => void,
): void => {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const anchor = (event.target as HTMLElement).closest('a')
  const href = anchor?.getAttribute('href')
  if (!anchor || !href || !href.startsWith('/') || anchor.target === '_blank') return
  event.preventDefault()
  onNavigate(href)
}

/** The same rule for a single link the component renders itself. */
export const followLink = (
  event: MouseEvent<HTMLAnchorElement>,
  path: string,
  onNavigate: (path: string) => void,
): void => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  onNavigate(path)
}
