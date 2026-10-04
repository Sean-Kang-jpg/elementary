/**
 * Map InfoWindows close on a map click, which a phone user does not guess and which
 * a popup covering half the screen leaves little room for. Each popup therefore
 * carries its own close button; this markup goes in the popup's header, and
 * `closablePopup` wires it.
 */
export const POPUP_CLOSE_BUTTON = `<button type="button" class="map-popup-close" data-popup-close aria-label="닫기" title="닫기">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
</button>`

export const closablePopup = (html: string, onClose: () => void): HTMLElement => {
  const element = document.createElement('div')
  element.innerHTML = html
  element.querySelector('[data-popup-close]')?.addEventListener('click', (event) => {
    event.stopPropagation()
    onClose()
  })
  return element
}

// Controls float over the map (the search box and filter row across the top, the
// education-layer toggle and its legend on the right), and the SDK's auto-pan only
// keeps a popup inside the map, so a marker near the top opened its popup under them,
// close button included. Pan until the popup clears the top row and nothing outside
// the map canvas sits on its close button.
const TOP_CONTROLS_CLEARANCE = 128
const CONTROL_GAP = 8

export const keepPopupClearOfMapControls = (map: NaverMap, popup: HTMLElement) => {
  window.requestAnimationFrame(() => {
    const canvas = popup.closest('[data-map-canvas]')
    const close = popup.querySelector('[data-popup-close]')
    if (!canvas || !close) return
    const button = close.getBoundingClientRect()
    let shift = Math.max(0, TOP_CONTROLS_CLEARANCE - popup.getBoundingClientRect().top)
    // One control can sit just above the next (the toggle over its legend), so look again after each move.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const y = button.top + button.height / 2 + shift
      if (y >= window.innerHeight) break
      const hit = document.elementFromPoint(button.left + button.width / 2, y)
      if (!hit || canvas.contains(hit)) break
      shift = hit.getBoundingClientRect().bottom + CONTROL_GAP - button.top
    }
    if (shift > 0) map.panBy(new window.naver.maps.Point(0, -shift))
  })
}
