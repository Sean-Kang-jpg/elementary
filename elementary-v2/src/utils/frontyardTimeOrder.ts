import type { FrontyardSlot } from './urlState'
import { toMinutes } from './schedule/fromSchoolData.ts'

/** Compare the best single session for each post. Ties keep the feed order. */
export function sortByTimeOverlap<T extends { time_slots: FrontyardSlot[] }>(
  posts: T[],
  slot: FrontyardSlot | null,
): T[] {
  if (!slot) return posts
  const start = toMinutes(slot.start)
  const end = toMinutes(slot.end)
  if (start === null || end === null || end <= start) return posts

  const bestOverlap = (post: T) => {
    let best = 0
    for (const time of post.time_slots) {
      if (time.weekday !== slot.weekday) continue
      const sessionStart = toMinutes(time.start)
      const sessionEnd = toMinutes(time.end)
      if (sessionStart === null || sessionEnd === null) continue
      const overlap = Math.min(end, sessionEnd) - Math.max(start, sessionStart)
      best = Math.max(best, overlap)
    }
    return best
  }

  return posts
    .map((post) => ({ post, overlap: bestOverlap(post) }))
    .sort((a, b) => b.overlap - a.overlap)
    .map(({ post }) => post)
}
