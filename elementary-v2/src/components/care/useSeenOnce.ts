import { useEffect, useRef, type RefObject } from 'react'

/**
 * Calls `onSeen` once, the first time half of `ref` is on screen, and again only
 * when `key` changes. The care blocks sit below the fold of a bottom sheet, so
 * "rendered" would count every detail opened; this counts the ones scrolled to.
 */
export const useSeenOnce = (ref: RefObject<Element>, key: string | null, onSeen: () => void) => {
  const callback = useRef(onSeen)
  callback.current = onSeen

  useEffect(() => {
    const element = ref.current
    if (!element || !key || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect()
        callback.current()
      }
    }, { threshold: 0.5 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [key, ref])
}
