import { useEffect, useReducer, useRef } from 'react'
import { CalendarClock, CalendarDays, ChevronRight } from 'lucide-react'
import { daysToEntry, roadmapFor } from '../../utils/roadmap'
import type { Profile } from '../../utils/profile'
import { track } from '../../utils/analytics'
import { describeProgress, dueBadge, groupTimeline, hasFamilyPlan, notePlanVisit, readTimeline, subscribeFamilyPlan } from '../../utils/familyPlan'
import { describeCoverage, planCoverage } from '../../utils/schedule/coverage'
import { readPlans } from '../../utils/schedule/plans'
import { displaySchoolName } from '../../utils/schoolName'
import { planPath, timetablePath } from '../../utils/urlState'
import { followLink } from './contentLinks'

interface PlanSummaryProps {
  entryYear: number | null
  profile: Profile
  onNavigate: (path: string) => void
}

/**
 * 홈의 우리집 일정 카드(UX-08c, 2026-11-01). 일정이 있는 가족에게만, 고민 목록 위에 뜬다.
 * D-day, 이번 달 아직 안 한 일 세 개까지, 이번 달 진행, 그리고 두 면(입학까지 / 우리 아이 한 주)으로 가는 길.
 * 2026-10-04의 RoadmapSummary(D-day와 할 일 두 개)를 이었다. 체크는 우리집 일정에서만 한다 — 홈은 현관이다.
 */
export default function PlanSummary({ entryYear, profile, onNavigate }: PlanSummaryProps) {
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeFamilyPlan(refresh), [])
  const active = entryYear !== null || hasFamilyPlan()
  useEffect(() => { if (active) notePlanVisit() }, [active])

  const view = entryYear === null ? null : roadmapFor(entryYear, profile)
  const days = entryYear === null ? null : daysToEntry(entryYear)
  const stage = view?.stage
  // 입학연도마다 한 번(다시 그릴 때마다가 아니라).
  const reported = useRef<number | null>(null)
  useEffect(() => {
    if (entryYear === null || days === null || !stage || reported.current === entryYear) return
    reported.current = entryYear
    track('view_roadmap', { days_to_admission: days, entry_year: entryYear, stage, entry_source: 'home' })
  }, [days, entryYear, stage])

  if (!active) return null

  const now = new Date()
  const groups = groupTimeline(readTimeline(now, { ...profile, entryYear }), now)
  // 이번 달 묶음(준비 단계는 시기 없는 묶음). 다 했으면 다음에 남은 묶음을 보여 준다.
  const current = view ? groups.find((group) => group.month === (view.stage === 'planning' ? null : view.month)) : groups[0]
  const open = current?.entries.filter((entry) => !entry.done) ?? []
  const next = open.length ? null : groups.find((group) => group !== current && group.entries.some((entry) => !entry.done)) ?? null
  const tasks = (open.length ? open : next?.entries.filter((entry) => !entry.done) ?? []).slice(0, 3)
  const heading = open.length
    ? (stage === 'planning' || !current || current.month === null ? '지금 해두면 좋은 일' : `${current.month}월에 할 일`)
    : next ? (next.month ? `${next.month}월에 할 일` : '담아 둔 일') : null
  const progress = current && view ? describeProgress(current.entries, stage === 'planning') : null

  const recent = [...readPlans().plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const timeline = planPath('timeline')
  const week = recent ? timetablePath(recent.schoolId) : planPath('week')
  const coverage = recent ? planCoverage(recent.entries) : null

  return (
    <section className="home-card roadmap-summary plan-summary" aria-labelledby="plan-summary-title">
      <div className="roadmap__dday">
        <CalendarDays size={20} aria-hidden="true" />
        <div>
          <p className="plan-summary__kicker">우리집 일정</p>
          <h2 id="plan-summary-title">{days !== null ? <>입학까지 약 <b>D-{days}</b></> : '우리 아이 한 주를 짜고 있어요'}</h2>
        </div>
      </div>
      {heading && tasks.length ? (
        <>
          <h3 className="roadmap__heading">{heading}</h3>
          <ul className="roadmap-summary__tasks">
            {tasks.map((entry) => {
              const due = dueBadge(entry.when, now)
              return (
                <li key={entry.id}>
                  <span>{entry.title}</span>
                  {due ? <em className={`roadmap__due roadmap__due--${due.tone}`}>{due.text}</em> : null}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
      {progress ? <p className="plan-progress">{progress}</p> : null}
      {entryYear !== null || groups.length ? (
        <a href={timeline} onClick={(event) => followLink(event, timeline, onNavigate)} className="roadmap-summary__more">
          <span>입학까지 전체 일정과 체크</span>
          <ChevronRight size={16} aria-hidden="true" />
        </a>
      ) : null}
      <a href={week} onClick={(event) => followLink(event, week, onNavigate)} className="roadmap-summary__more plan-summary__week">
        <span className="plan-summary__week-text">
          <span><CalendarClock size={16} aria-hidden="true" /> {recent ? `${displaySchoolName(recent.schoolName)} 한 주 시간표 이어서 보기` : '우리 아이 한 주 시간표 짜기'}</span>
          {coverage ? <small className={`plan-coverage plan-coverage--${coverage.state}`}>{describeCoverage(coverage)}</small> : null}
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </a>
    </section>
  )
}
