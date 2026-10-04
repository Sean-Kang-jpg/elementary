import { useEffect, useRef } from 'react'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { daysToEntry, roadmapFor } from '../../utils/roadmap'
import type { Profile } from '../../utils/profile'
import { track } from '../../utils/analytics'
import { VIEW_PATHS } from '../../utils/urlState'
import { followLink } from './contentLinks'

interface RoadmapSummaryProps {
  entryYear: number
  profile: Profile
  onNavigate: (path: string) => void
}

/**
 * The home's short version of the roadmap (2026-10-04): D-day and the next two
 * things to do. The whole timeline and the preferences that shape it live in the
 * 입학 준비 hub, so the home stays a front door with search on top.
 */
export default function RoadmapSummary({ entryYear, profile, onNavigate }: RoadmapSummaryProps) {
  const days = daysToEntry(entryYear)
  const view = roadmapFor(entryYear, profile)
  // This month's tasks, or the next month that has any.
  const nextMonth = view.upcoming[0]
  const tasks = (view.now.length ? view.now : nextMonth?.tasks ?? []).slice(0, 2)
  const heading = view.now.length
    ? (view.stage === 'planning' ? '지금 해두면 좋은 일' : `${view.month}월에 할 일`)
    : nextMonth ? `${nextMonth.month}월에 할 일` : null
  const hub = `${VIEW_PATHS.guide}?year=${entryYear}`

  const reported = useRef<number | null>(null)
  useEffect(() => {
    if (reported.current === entryYear) return
    reported.current = entryYear
    track('view_roadmap', { days_to_admission: days, entry_year: entryYear, stage: view.stage, entry_source: 'home' })
  }, [days, entryYear, view.stage])

  return (
    <section className="home-card roadmap-summary" aria-labelledby="roadmap-summary-title">
      <div className="roadmap__dday">
        <CalendarDays size={20} aria-hidden="true" />
        <h2 id="roadmap-summary-title">입학까지 약 <b>D-{days}</b></h2>
      </div>
      {heading && tasks.length ? (
        <>
          <h3 className="roadmap__heading">{heading}</h3>
          <ul className="roadmap-summary__tasks">
            {tasks.map((task) => <li key={task.id}>{task.text}</li>)}
          </ul>
        </>
      ) : null}
      <a href={hub} onClick={(event) => followLink(event, hub, onNavigate)} className="roadmap-summary__more">
        <span>3월 입학까지 전체 일정과 체크리스트</span>
        <ChevronRight size={16} aria-hidden="true" />
      </a>
    </section>
  )
}
