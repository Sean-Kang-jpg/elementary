import { useEffect, useReducer, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { dueBadge, readPinned, readTimeline, removeFromPlan, restoreToPlan, setTimelineDone, subscribeFamilyPlan, type PinnedItem } from '../../utils/familyPlan'
import type { Profile } from '../../utils/profile'
import { followLink } from './contentLinks'

/**
 * 입학연도를 고르기 전의 입학까지 면에서 담은 항목(2026-11-03). 로드맵은 연도가 있어야 만들지만, 홈·가이드에서
 * 담은 것은 연도 없이도 담기므로 여기서 보이고 뺄 수 있어야 한다. 입학연도를 고르면 RoadmapCard가 이어 받는다.
 */
export default function PinnedPlanList({ profile, onNavigate }: { profile: Profile; onNavigate: (path: string) => void }) {
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeFamilyPlan(refresh), [])
  const [undo, setUndo] = useState<PinnedItem | null>(null)
  const entries = readTimeline(new Date(), { ...profile, entryYear: null })
  if (!entries.length && !undo) return null

  return <section className="home-card roadmap" aria-labelledby="pinned-plan-title">
    <h2 id="pinned-plan-title" className="roadmap__heading">담아 둔 일정</h2>
    {undo && <p className="roadmap__undo" role="status">
      <span>일정에서 뺐어요 · {undo.title}</span>
      <button type="button" onClick={() => { if (restoreToPlan(undo)) setUndo(null) }}>되돌리기</button>
    </p>}
    <ul className="roadmap__tasks">
      {entries.map((entry) => {
        const due = dueBadge(entry.when)
        return <li key={entry.id} className={entry.done ? 'is-done' : undefined}>
          <input type="checkbox" className="roadmap__done" checked={entry.done} onChange={(event) => setTimelineDone(entry.id, event.target.checked)} aria-label={`${entry.title} 완료`} />
          {entry.href ? <a href={entry.href} onClick={(event) => followLink(event, entry.href!, onNavigate)}>
            <span>{entry.title}</span>
            {due ? <em className={`roadmap__due roadmap__due--${due.tone}`}>{due.text}</em> : null}
            <ChevronRight size={16} aria-hidden="true" />
          </a> : <span><span>{entry.title}</span></span>}
          <button type="button" className="roadmap__leave" title="일정에서 빼기" aria-label={`${entry.title} 일정에서 빼기`} onClick={() => {
            const item = readPinned(entry.id)
            if (item && removeFromPlan(entry.id)) setUndo(item)
          }}><X size={16} aria-hidden="true" /></button>
        </li>
      })}
    </ul>
  </section>
}
