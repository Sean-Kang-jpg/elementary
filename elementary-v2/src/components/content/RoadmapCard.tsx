import { CalendarDays, ChevronRight, ListChecks } from 'lucide-react'
import { useEffect, useRef } from 'react'
import checklist from '../../content/checklist.json'
import { daysToEntry, ENTRY_DAY_NOTE, roadmapFor, type RoadmapTask } from '../../utils/roadmap'
import type { MovingPlan, Profile, SchoolInterest } from '../../utils/profile'
import { readChecklist } from '../../utils/profile'
import { track } from '../../utils/analytics'
import { VIEW_PATHS } from '../../utils/urlState'
import { followLink } from './contentLinks'

interface RoadmapCardProps {
  entryYear: number
  profile: Profile
  onProfileChange: (update: (current: Profile) => Profile) => void
  onNavigate: (path: string) => void
}

const MOVING: Array<{ value: MovingPlan; label: string }> = [
  { value: 'none', label: '이사 계획 없음' },
  { value: 'considering', label: '이사 검토 중' },
  { value: 'planned', label: '이사 예정' },
]

const TOTAL_ITEMS = checklist.groups.reduce((n, group) => n + group.items.length, 0)

/**
 * "입학까지 약 D-N" and this month's tasks (PRD v2 7.2). The tasks narrow to the
 * family: private-school steps only when they are considering one, moving steps
 * only when a move is on the table.
 */
export default function RoadmapCard({ entryYear, profile, onProfileChange, onNavigate }: RoadmapCardProps) {
  const days = daysToEntry(entryYear)
  const view = roadmapFor(entryYear, profile)
  const done = Object.values(readChecklist()).filter(Boolean).length

  // One view_roadmap per year shown, not per re-render or profile tweak.
  const reported = useRef<number | null>(null)
  useEffect(() => {
    if (reported.current === entryYear) return
    reported.current = entryYear
    track('view_roadmap', { days_to_admission: days, entry_year: entryYear, stage: view.stage, entry_source: 'home' })
  }, [days, entryYear, view.stage])

  const toggleInterest = (value: SchoolInterest) => onProfileChange((current) => {
    const has = current.interest.includes(value)
    const interest = has ? current.interest.filter((item) => item !== value) : [...current.interest, value]
    return { ...current, interest: interest.length ? interest : ['public'] }
  })

  const taskList = (tasks: RoadmapTask[]) => (
    <ul className="roadmap__tasks">
      {tasks.map((task) => (
        <li key={task.id}>
          {task.link ? (
            <a href={task.link} onClick={(event) => followLink(event, task.link!, onNavigate)}>
              <span>{task.text}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          ) : <span>{task.text}</span>}
        </li>
      ))}
    </ul>
  )

  return (
    <section className="home-card roadmap" aria-labelledby="roadmap-title">
      <div className="roadmap__dday">
        <CalendarDays size={20} aria-hidden="true" />
        <div>
          <h2 id="roadmap-title">입학까지 약 <b>D-{days}</b></h2>
          <p>{ENTRY_DAY_NOTE}</p>
        </div>
      </div>

      <div className="roadmap__prefs" aria-label="맞춤 설정">
        <div className="roadmap__pref-row" role="group" aria-label="관심 학교">
          <button type="button" aria-pressed={profile.interest.includes('public')} onClick={() => toggleInterest('public')} className="pref-chip">공립</button>
          <button type="button" aria-pressed={profile.interest.includes('private')} onClick={() => toggleInterest('private')} className="pref-chip">사립·국립</button>
        </div>
        <div className="roadmap__pref-row" role="group" aria-label="이사 계획">
          {MOVING.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={profile.moving === option.value}
              onClick={() => onProfileChange((current) => ({ ...current, moving: option.value }))}
              className="pref-chip"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <h3 className="roadmap__heading">{view.stage === 'planning' ? '지금 해두면 좋은 일' : `${view.month}월에 할 일`}</h3>
      {view.now.length ? taskList(view.now) : <p className="roadmap__empty">이번 달에는 챙길 일정이 없어요.</p>}

      {view.upcoming.length ? (
        <div className="roadmap__timeline">
          <h3 className="roadmap__heading roadmap__heading--next">3월 입학까지 남은 일정</h3>
          <ol>
            {view.upcoming.map(({ month, tasks }) => (
              <li key={month}>
                <span className="roadmap__month">{month}월</span>
                {taskList(tasks)}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <a href={VIEW_PATHS.checklist} onClick={(event) => followLink(event, VIEW_PATHS.checklist, onNavigate)} className="roadmap__checklist">
        <ListChecks size={18} aria-hidden="true" />
        <span>입학 준비 체크리스트</span>
        <b>{done}/{TOTAL_ITEMS}</b>
        <ChevronRight size={16} aria-hidden="true" />
      </a>
    </section>
  )
}
