import { useCallback, useEffect, useRef, useState } from 'react'
import { getLikeCounts, getMyLikes, setLike } from '../../services/curriculumService'
import { track } from '../../utils/analytics'

export interface LikeState {
  counts: Record<string, number>
  mine: Set<string>
  /** Null until the counts arrive; false when SQL 24 is not deployed. */
  ready: boolean
  error: string | null
  toggle: (targetKey: string, event: { name: string; params: Record<string, string | number | undefined> }) => void
}

/**
 * Like counts and this browser's own likes for the targets on one screen, with
 * optimistic toggling: the count moves at once and rolls back if the write fails.
 */
export const useLikes = (keys: string[]): LikeState => {
  const signature = keys.join('|')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [mine, setMine] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(new Set<string>())

  useEffect(() => {
    let active = true
    const targets = signature ? signature.split('|') : []
    setReady(false)
    Promise.all([getLikeCounts(targets), getMyLikes(targets)])
      .then(([nextCounts, nextMine]) => {
        if (!active) return
        setCounts(nextCounts)
        setMine(nextMine)
        setReady(true)
      })
      .catch((reason) => {
        console.error('따봉 조회 실패:', reason)
        if (active) setReady(true)
      })
    return () => { active = false }
  }, [signature])

  const toggle = useCallback<LikeState['toggle']>((targetKey, event) => {
    if (pending.current.has(targetKey)) return
    pending.current.add(targetKey)
    const liked = !mine.has(targetKey)
    const apply = (on: boolean) => {
      setMine((current) => {
        const next = new Set(current)
        if (on) next.add(targetKey)
        else next.delete(targetKey)
        return next
      })
      setCounts((current) => ({ ...current, [targetKey]: Math.max(0, (current[targetKey] ?? 0) + (on ? 1 : -1)) }))
    }
    apply(liked)
    setError(null)
    setLike(targetKey, liked)
      .then(() => { if (liked) track(event.name, event.params) })
      .catch((reason) => {
        console.error('따봉 저장 실패:', reason)
        apply(!liked)
        setError('따봉을 저장하지 못했습니다. 잠시 후 다시 눌러 주세요.')
      })
      .finally(() => pending.current.delete(targetKey))
  }, [mine])

  return { counts, mine, ready, error, toggle }
}
