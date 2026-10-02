/**
 * Load the Naver Maps SDK when a map is about to be shown, not on every page.
 *
 * It used to be a synchronous script tag in index.html's head, so the home,
 * favorites and every other page waited for an SDK they never use (ADR-008
 * section 5). Naver supports loading v3 asynchronously.
 *
 * The client ID stays hardcoded on purpose. It is a public identifier that ships
 * to every browser either way; what protects it is the host allowlist registered
 * with Naver Cloud, not where it is written down.
 *
 * Readiness is still detected by MapContainer's polling for `window.naver.maps`,
 * with its deadline and error state unchanged - this only starts the download.
 * The auth-failure global is installed by MapContainer before it calls this, so
 * an unregistered host is still reported by name.
 */
const SDK_URL = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=8bhvq317xy'

let loading: Promise<void> | null = null

export const loadNaverMaps = (): Promise<void> => {
  if (window.naver?.maps) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      // Forget the failed attempt so remounting the map can try again.
      loading = null
      script.remove()
      reject(new Error('Naver Maps SDK failed to load'))
    }
    document.head.appendChild(script)
  })
  return loading
}
