import { useEffect, useReducer } from 'react'
import { dueBadge, readPlanChanges, setTimelineDone, subscribeFamilyPlan, type TimelineEntry } from '../../utils/familyPlan'
import type { Profile } from '../../utils/profile'
import { followLink } from './contentLinks'

const SHOWN = 3

/**
 * 지난번 이후 달라진 것(UX-18, 2026-11-03). 하루 이상 지나 돌아온 가족에게만, 달라진 게 있을 때만 뜬다:
 * 달이 바뀐 것, 그 사이 날짜가 지났는데 아직 안 한 일(바로 '했어요'), 새로 2주 안으로 들어온 일.
 * 홈의 우리집 일정 카드와 입학까지 면이 같이 쓴다. 기준 시각은 familyPlan.readPlanChanges가 정한다.
 */
export default function PlanChangesNote({ entryYear, profile, onNavigate }: {
  entryYear: number | null
  profile: Profile
  onNavigate: (path: string) => void
}) {
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeFamilyPlan(refresh), [])
  const now = new Date()
  const changes = readPlanChanges(now, { ...profile, entryYear })
  if (!changes) return null
  const since = `${changes.since.getMonth() + 1}월 ${changes.since.getDate()}일`
  const link = (entry: TimelineEntry) => entry.href
    ? <a href={entry.href} onClick={(event) => followLink(event, entry.href!, onNavigate)}>{entry.title}</a>
    : <span>{entry.title}</span>

  return <section className="plan-changes" aria-labelledby="plan-changes-title" data-testid="plan-changes">
    <h3 id="plan-changes-title" className="plan-changes__title">지난번({since}) 이후</h3>
    <ul className="plan-changes__list">
      {changes.newMonth && <li>
        <b>{changes.newMonth.month}월이 됐어요.</b> {changes.newMonth.open ? `이번 달 챙길 것 ${changes.newMonth.open}개` : '이번 달 챙길 것은 다 했어요 ✓'}
      </li>}
      {changes.missed.slice(0, SHOWN).map((entry) => <li key={entry.id} className="plan-changes__missed">
        <em className="roadmap__due roadmap__due--missed">지남</em> {link(entry)}
        <button type="button" className="plan-changes__done" onClick={() => setTimelineDone(entry.id, true)} aria-label={`${entry.title} 했어요`}>했어요</button>
      </li>)}
      {changes.nearing.slice(0, SHOWN).map((entry) => {
        const due = dueBadge(entry.when, now)
        return <li key={entry.id}>
          {due && <em className={`roadmap__due roadmap__due--${due.tone}`}>{due.text}</em>} {link(entry)}
        </li>
      })}
    </ul>
  </section>
}
