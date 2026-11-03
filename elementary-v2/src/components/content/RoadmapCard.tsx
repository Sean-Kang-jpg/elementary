import { CalendarDays, ChevronRight, ListChecks, X } from 'lucide-react'
import { useEffect, useReducer, useRef, useState } from 'react'
import checklist from '../../content/checklist.json'
import { daysToEntry, ENTRY_DAY_NOTE, roadmapFor } from '../../utils/roadmap'
import type { MovingPlan, Profile, SchoolInterest } from '../../utils/profile'
import { readChecklist } from '../../utils/profile'
import { daysUntil, describeProgress, dueBadge, groupTimeline, readHiddenTimeline, readPinned, readTimeline, removeFromPlan, restoreToPlan, setTimelineDone, setTimelineHidden, subscribeFamilyPlan, type TimelineEntry } from '../../utils/familyPlan'
import { track } from '../../utils/analytics'
import { planPath, VIEW_PATHS } from '../../utils/urlState'
import { followLink } from './contentLinks'
import IcsButton from './IcsButton'

interface RoadmapCardProps {
  entryYear: number
  profile: Profile
  onProfileChange: (update: (current: Profile) => Profile) => void
  onNavigate: (path: string) => void
  /** Where the card is shown, for view_roadmap. MY showed the full card from 2026-10-04, 우리집 일정 since UX-26. */
  source?: 'home' | 'guides' | 'my' | 'plan'
}

const MOVING: Array<{ value: MovingPlan; label: string }> = [
  { value: 'none', label: '이사 계획 없음' },
  { value: 'considering', label: '이사 검토 중' },
  { value: 'planned', label: '이사 예정' },
]

const CHECKLIST_IDS = checklist.groups.flatMap((group) => group.items.map((item) => item.id))

/**
 * "입학까지 약 D-N" and this month's tasks (PRD v2 7.2). The tasks narrow to the
 * family: private-school steps only when they are considering one, moving steps
 * only when a move is on the table.
 *
 * Since UX-03 (2026-11-01) the list is the family plan's timeline: tasks with a
 * decree date show D-N, each can be ticked done (the same mark as the checklist),
 * and items pinned from a guide or the home join it in their month.
 *
 * Since 2026-11-03 every row can leave the plan: a pinned item is taken out, a
 * roadmap task is hidden as 해당 없어요 (kept under 숨긴 일정 to bring back), and
 * either can be undone right away.
 */
export default function RoadmapCard({ entryYear, profile, onProfileChange, onNavigate, source = 'home' }: RoadmapCardProps) {
  const days = daysToEntry(entryYear)
  const view = roadmapFor(entryYear, profile)
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeFamilyPlan(refresh), [])
  const groups = groupTimeline(readTimeline(new Date(), { ...profile, entryYear }))
  const hiddenEntries = readHiddenTimeline(new Date(), { ...profile, entryYear })
  const checked = readChecklist()
  const done = CHECKLIST_IDS.filter((id) => checked[id]).length
  const [undo, setUndo] = useState<{ text: string; restore: () => boolean } | null>(null)
  const leave = (entry: TimelineEntry) => {
    if (entry.source === 'pinned') {
      const item = readPinned(entry.id)
      if (item && removeFromPlan(entry.id)) setUndo({ text: `일정에서 뺐어요 · ${entry.title}`, restore: () => restoreToPlan(item) })
    } else if (setTimelineHidden(entry.id, true)) {
      setUndo({ text: `숨겼어요 · ${entry.title}`, restore: () => setTimelineHidden(entry.id, false) })
    }
  }

  // One view_roadmap per year shown, not per re-render or profile tweak.
  const reported = useRef<number | null>(null)
  useEffect(() => {
    if (reported.current === entryYear) return
    reported.current = entryYear
    track('view_roadmap', { days_to_admission: days, entry_year: entryYear, stage: view.stage, entry_source: source })
  }, [days, entryYear, view.stage, source])

  const toggleInterest = (value: SchoolInterest) => onProfileChange((current) => {
    const has = current.interest.includes(value)
    const interest = has ? current.interest.filter((item) => item !== value) : [...current.interest, value]
    return { ...current, interest: interest.length ? interest : ['public'] }
  })

  const taskList = (entries: TimelineEntry[]) => (
    <ul className="roadmap__tasks">
      {entries.map((entry) => {
        const due = dueBadge(entry.when)
        return (
          <li key={entry.id} className={entry.done ? 'is-done' : undefined}>
            <input
              type="checkbox"
              className="roadmap__done"
              checked={entry.done}
              onChange={(event) => setTimelineDone(entry.id, event.target.checked)}
              aria-label={`${entry.title} 완료`}
            />
            {entry.href ? (
              <a href={entry.href} onClick={(event) => followLink(event, entry.href!, onNavigate)}>
                <span>{entry.title}</span>
                {due ? <em className={`roadmap__due roadmap__due--${due.tone}`}>{due.text}</em> : null}
                <ChevronRight size={16} aria-hidden="true" />
              </a>
            ) : (
              <span>
                <span>{entry.title}</span>
                {due ? <em className={`roadmap__due roadmap__due--${due.tone}`}>{due.text}</em> : null}
              </span>
            )}
            <button type="button" className="roadmap__leave" onClick={() => leave(entry)}
              title={entry.source === 'pinned' ? '일정에서 빼기' : '우리 집엔 해당 없어요(숨기기)'}
              aria-label={entry.source === 'pinned' ? `${entry.title} 일정에서 빼기` : `${entry.title} 우리 집엔 해당 없어요`}>
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )

  // 캘린더로는 날짜가 정해진, 아직 지나지 않고 끝내지 않은 일정만 보낸다. 달만 아는 할 일을 1일로 적으면 틀린 날짜가 된다.
  const calendarItems = groups
    .flatMap((group) => group.entries)
    .filter((entry) => entry.when.kind === 'date' && !entry.done && (daysUntil(entry.when) ?? -1) >= 0)
    .map((entry) => ({ id: entry.id, title: entry.title, date: entry.when.kind === 'date' ? entry.when.date : '', url: entry.href ?? planPath('timeline') }))

  // 이번 달(준비 단계에서는 시기 없는 목록)이 위에, 나머지는 3월까지의 줄기로.
  const thisMonth = groups.find((group) => group.month === (view.stage === 'planning' ? null : view.month)) ?? null
  const later = groups.filter((group) => group !== thisMonth)

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

      {undo && <p className="roadmap__undo" role="status">
        <span>{undo.text}</span>
        <button type="button" onClick={() => { if (undo.restore()) setUndo(null) }}>되돌리기</button>
      </p>}

      <h3 className="roadmap__heading">{view.stage === 'planning' ? '지금 해두면 좋은 일' : `${view.month}월에 할 일`}</h3>
      {thisMonth ? <>
        <p className="plan-progress">{describeProgress(thisMonth.entries, view.stage === 'planning')}</p>
        {taskList(thisMonth.entries)}
      </> : <p className="roadmap__empty">이번 달에는 챙길 일정이 없어요.</p>}

      {later.length ? (
        <div className="roadmap__timeline">
          <h3 className="roadmap__heading roadmap__heading--next">{view.stage === 'planning' ? '담아 둔 일정' : '3월 입학까지 남은 일정'}</h3>
          <ol>
            {later.map(({ month, entries }) => (
              <li key={month ?? 'anytime'}>
                <span className="roadmap__month">{month ? `${month}월` : '언제든'}</span>
                {taskList(entries)}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {hiddenEntries.length ? (
        <details className="roadmap__hidden">
          <summary>우리 집엔 해당 없다고 숨긴 일정 {hiddenEntries.length}개</summary>
          <ul>
            {hiddenEntries.map((entry) => <li key={entry.id}>
              <span>{entry.title}</span>
              <button type="button" onClick={() => setTimelineHidden(entry.id, false)} aria-label={`${entry.title} 다시 보기`}>다시 보기</button>
            </li>)}
          </ul>
        </details>
      ) : null}

      {calendarItems.length ? (
        <div className="roadmap__ics">
          <p>날짜가 정해진 일정 {calendarItems.length}개를 휴대폰 캘린더에도 넣어 두세요.</p>
          <IcsButton items={calendarItems} />
        </div>
      ) : null}

      <a href={VIEW_PATHS.checklist} onClick={(event) => followLink(event, VIEW_PATHS.checklist, onNavigate)} className="roadmap__checklist">
        <ListChecks size={18} aria-hidden="true" />
        <span>입학 준비 체크리스트</span>
        <b>{done}/{CHECKLIST_IDS.length}</b>
        <ChevronRight size={16} aria-hidden="true" />
      </a>
    </section>
  )
}
