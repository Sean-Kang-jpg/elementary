import { useEffect, useRef, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import type { School } from '../../types'
import { getSchoolDetail } from '../../services/dataService'
import { readFavorites, subscribeFavorites, type FavoriteRecord } from '../../utils/favorites'
import { notePlanVisit, type PlanFace } from '../../utils/familyPlan'
import type { Profile } from '../../utils/profile'
import { readPlans, subscribePlans } from '../../utils/schedule/plans'
import { displaySchoolName } from '../../utils/schoolName'
import { planPath, timetablePath, VIEW_PATHS } from '../../utils/urlState'
import ChecklistBanner from '../content/ChecklistBanner'
import EntryProfile from '../content/EntryProfile'
import RoadmapCard from '../content/RoadmapCard'
import PlanChangesNote from '../content/PlanChangesNote'
import PinnedPlanList from '../content/PinnedPlanList'
import { followLink } from '../content/contentLinks'
import SchoolDayEstimateCard from '../school/SchoolDayEstimateCard'
import MySchedule from './MySchedule'
import SchoolSelection from '../search/SchoolSelection'
import SampleWeek from './SampleWeek'

interface TimetablePageProps {
  schoolId: string | null
  /** 주소의 `?face=`. 없으면 아래 규칙으로 고른다. */
  face: PlanFace | null
  entryYear: number | null
  profile: Profile
  onEntryYearChange: (year: number) => void
  onProfileChange: (update: (current: Profile) => Profile) => void
  onSchoolChange: (schoolId: string | null) => void
  onNavigate: (path: string) => void
}

const STEPS = ['학교 고르기', '시간표 확인', '직접 짜기']

/**
 * 우리집 일정 (`/timetable`, UX-26 2026-11-01). 두 면이 있다.
 *
 * - 입학까지(`?face=timeline`): 입학연도로 거른 로드맵 + 담은 항목, D-day와 완료 표시. 2026-10-04부터 MY에 있던 것을 옮겼다.
 * - 우리 아이 한 주(`?face=week`, `?school=B…`): 2026-10-19의 시간표 미리 짜보기. 학교 고르기 → 그 학교의
 *   초1 하루(하교·방과후·맞춤형·돌봄) 확인 → 초안을 만들어 주변 학원과 직접 일정까지 넣기.
 *
 * 면이 없는 주소는 입학까지로 연다. 입학연도 없이 시간표만 짜 둔 가족은 한 주로 연다 — 그들에게 입학까지는 빈 칩뿐이다.
 * 모든 값은 이 기기에만 있다(`familyPlan.ts`, `plans.ts`). 기기마다 다른 화면이라 색인하지 않는다.
 */
export default function TimetablePage({
  schoolId: routeSchoolId, face: routeFace, entryYear, profile, onEntryYearChange, onProfileChange, onSchoolChange, onNavigate,
}: TimetablePageProps) {
  const [plans, setPlans] = useState(readPlans)
  const [favorites, setFavorites] = useState<FavoriteRecord[]>(readFavorites)
  useEffect(() => subscribePlans(() => setPlans(readPlans())), [])
  useEffect(() => subscribeFavorites(() => setFavorites(readFavorites())), [])
  useEffect(() => notePlanVisit(), [])
  const savedSchools = favorites.filter((item) => item.kind === 'school')
  const face: PlanFace = routeFace ?? (entryYear === null && plans.plans.length ? 'week' : 'timeline')

  // 한 주 면의 주소에 학교가 없으면 가장 최근에 고친 초안 → 첫 관심 학교 순으로 이어서 연다. 첫 그림부터 그 학교로
  // 그린다 — 주소를 고친 뒤에 다시 그리면 빈 화면이 한 번 보였다가 시간표가 펼쳐진다(2026-10-23).
  const recentPlan = [...plans.plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const fallbackId = recentPlan?.schoolId ?? savedSchools[0]?.id ?? null
  const schoolId = face === 'week' ? routeSchoolId ?? fallbackId : null
  useEffect(() => {
    if (face === 'week' && !routeSchoolId && fallbackId) onSchoolChange(fallbackId)
  }, [face, routeSchoolId, fallbackId, onSchoolChange])

  // 고른 학교의 공개 자료. 운영 키가 아닌 옛 초안 ID는 null로 끝나고, 초안 편집은 그대로 된다.
  const [detail, setDetail] = useState<{ id: string; school: School | null } | null>(null)
  useEffect(() => {
    if (!schoolId) return
    let active = true
    getSchoolDetail(schoolId)
      .then((school) => { if (active) setDetail({ id: schoolId, school }) })
      .catch(() => { if (active) setDetail({ id: schoolId, school: null }) })
    return () => { active = false }
  }, [schoolId])
  const school = detail?.id === schoolId ? detail.school : null
  const loadingDetail = Boolean(schoolId) && detail?.id !== schoolId

  const plan = plans.plans.find((item) => item.schoolId === schoolId)
  const name = school?.school_name
    ?? plan?.schoolName
    ?? savedSchools.find((item) => item.id === schoolId)?.name
    ?? null
  const shownName = school ? displaySchoolName(school.school_name, school.address, school.establishment_type) : name && displaySchoolName(name)
  const step = !schoolId ? 0 : plan ? 2 : 1

  // 초안을 막 만들면 화면이 시간표 중심으로 바뀐다. 아래로 내려가 있던 자리 그대로면 시간표가 위로 잘려 보인다.
  const page = useRef<HTMLElement>(null)
  const hadPlan = useRef(Boolean(plan))
  useEffect(() => {
    if (plan && !hadPlan.current) page.current?.scrollTo({ top: 0 })
    hadPlan.current = Boolean(plan)
  }, [plan])

  // 초안 유무로 레이아웃이 바뀌면 학교 목록이 다시 만들어진다. 4번째 학교 거절 같은 안내가 그때 사라지지 않게 여기서 든다.
  const [pickMessage, setPickMessage] = useState('')
  const chips = <SchoolSelection schoolId={schoolId} onChange={onSchoolChange} message={pickMessage} onMessage={setPickMessage} />

  const weekSchool = schoolId ?? fallbackId
  const weekHref = weekSchool ? timetablePath(weekSchool) : planPath('week')
  const faces = [
    { id: 'timeline' as const, label: '입학까지', href: planPath('timeline') },
    { id: 'week' as const, label: '우리 아이 한 주', href: weekHref },
  ]
  const header = (
    <div className="plan-head">
      <h1 id="timetable-title">우리집 일정</h1>
      <nav className="plan-faces" aria-label="우리집 일정 보기">
        {faces.map((item) => (
          <a key={item.id} href={item.href} aria-current={face === item.id ? 'page' : undefined}
            onClick={(event) => followLink(event, item.href, onNavigate)}>{item.label}</a>
        ))}
      </nav>
    </div>
  )

  if (face === 'timeline') {
    return (
      <section ref={page} className="app-destination app-page content-page timetable-page plan-page" aria-labelledby="timetable-title">
        <div className="content-page__inner">
          {header}
          <p className="content-page__lead">3월 입학까지 할 일을 시기별로 모았어요. 끝낸 일은 체크해 두세요.</p>
          <EntryProfile entryYear={entryYear} profile={profile} onEntryYearChange={onEntryYearChange} />
          <PlanChangesNote entryYear={entryYear} profile={profile} onNavigate={onNavigate} />
          {entryYear ? (
            <RoadmapCard entryYear={entryYear} profile={profile} onProfileChange={onProfileChange} onNavigate={onNavigate} source="plan" />
          ) : (
            <>
              <p className="my-help">입학연도를 고르면 취학통지·예비소집·입학 준비가 달마다 나오고, 날짜가 정해진 일은 D-day로 보여요.</p>
              <PinnedPlanList profile={profile} onNavigate={onNavigate} />
              <ChecklistBanner onNavigate={onNavigate} />
            </>
          )}
          <p className="my-note">
            이 화면의 내용은 이 기기의 브라우저에만 저장돼요.{' '}
            <a href={VIEW_PATHS.privacy} onClick={(event) => followLink(event, VIEW_PATHS.privacy, onNavigate)}>개인정보처리방침</a>
          </p>
        </div>
      </section>
    )
  }

  // 초안이 있으면 시간표가 첫 화면이다. 안내·단계·운영 자료는 초안을 만들기 전에만 앞에 둔다.
  if (schoolId && plan) {
    return (
      <section ref={page} className="app-destination app-page content-page timetable-page timetable-page--editing" aria-labelledby="timetable-title">
        <div className="content-page__inner">
          {header}
          {chips}

          <MySchedule key={schoolId} school={{ id: schoolId, name: name ?? plan.schoolName, displayName: shownName ?? undefined }} entryYear={entryYear}
            saved={savedSchools.some((item) => item.id === schoolId)} onNavigate={onNavigate} />
          {school && (
            <details className="timetable-source my-card">
              <summary>{shownName} 운영 자료 보기</summary>
              <SchoolDayEstimateCard school={school} onOpenGuide={onNavigate} />
            </details>
          )}
        </div>
      </section>
    )
  }

  return (
    <section ref={page} className="app-destination app-page content-page timetable-page" aria-labelledby="timetable-title">
      <div className="content-page__inner">
        {header}
        <p className="timetable-page__kicker"><CalendarClock size={16} aria-hidden="true" /> 맞춤형 · 방과후 · 돌봄 · 주변 학원</p>
        <p className="content-page__lead">학교의 초1 하루를 먼저 보고, 입학 전에 우리 아이 한 주를 직접 그려 봐요.</p>

        <ol className="timetable-steps" aria-label="진행 단계">
          {STEPS.map((label, index) => (
            <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'is-done' : undefined}>
              <b>{index + 1}</b><span>{label}</span>
            </li>
          ))}
        </ol>

        <section className="timetable-pick my-card" aria-labelledby="timetable-pick-title">
          <h2 id="timetable-pick-title">1. 학교 고르기</h2>
          {chips}
          <p className="my-help">학교는 최대 3곳까지 등록할 수 있어요. 시간표는 이 기기의 브라우저에만 저장돼요.</p>
        </section>

        {!schoolId && (
          <section className="timetable-sample my-card" aria-labelledby="timetable-sample-title">
            <h2 id="timetable-sample-title">이런 한 주를 그리게 돼요</h2>
            <p className="my-help">하교 시각 뒤로 돌봄·방과후·학원을 넣으면, 요일마다 아이가 어디에 있는지 한눈에 보여요.</p>
            <SampleWeek />
          </section>
        )}

        {schoolId && (loadingDetail ? (
          <p className="my-help" role="status">학교 자료를 불러오는 중…</p>
        ) : !name ? (
          <p className="my-help" role="status">이 학교를 찾지 못했어요. 위에서 다시 검색해 주세요.</p>
        ) : (
          <>
            {school && (
              <section className="timetable-source my-card" aria-labelledby="timetable-source-title">
                <h2 id="timetable-source-title">2. {shownName} 초1 하루 확인</h2>
                <p className="my-help">학교가 공시한 운영계획으로 만든 예상이에요. 아래에서 초안을 만들면 하교 시각이 먼저 들어가고, 강좌·돌봄·학원은 직접 골라요.</p>
                <button type="button" className="my-button timetable-skip"
                  onClick={() => document.getElementById('my-schedule-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  3. 바로 시간표 짜기로 가기
                </button>
                <SchoolDayEstimateCard school={school} onOpenGuide={onNavigate} />
              </section>
            )}
            <MySchedule key={schoolId} school={{ id: schoolId, name, displayName: shownName ?? undefined }} entryYear={entryYear}
              saved={savedSchools.some((item) => item.id === schoolId)} onNavigate={onNavigate} />
          </>
        ))}
      </div>
    </section>
  )
}
