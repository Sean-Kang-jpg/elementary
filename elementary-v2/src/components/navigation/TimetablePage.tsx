import { useEffect, useRef, useState } from 'react'
import timetableMeta from '../../content/timetable-meta.json'
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
import MySchedule from './MySchedule'
import GapDialog from './GapDialog'
import { ChevronDown, School as SchoolIcon } from 'lucide-react'
import '../../styles/timetable-gap-map.css'
import { UNSPECIFIED_SCHOOL } from '../../utils/schedule/standalone'
import SchoolSelection from '../search/SchoolSelection'
import GapMapExample from './GapMapExample'
import { funnelMeasurement, trackDisplayedScreen } from '../../utils/analytics'

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

/**
 * 우리집 일정 (`/timetable`, UX-26 2026-11-01). 두 면이 있다.
 *
 * - 입학까지(`?face=timeline`): 입학연도로 거른 로드맵 + 담은 항목, D-day와 완료 표시. 2026-10-04부터 MY에 있던 것을 옮겼다.
 * - 우리 아이 한 주(`?face=week`, `?school=B…`): 2026-10-19의 시간표 미리 짜보기. 학교 고르기 → 그 학교의
 *   초1 하루(하교·방과후·맞춤형·돌봄) 확인 → 초안을 만들어 주변 학원과 직접 일정까지 넣기.
 *
 * 면이 없는 주소는 한 주로 연다. 입학까지는 명시적인 면 주소로 연다.
 * 모든 값은 이 기기에만 있다(`familyPlan.ts`, `plans.ts`). 기기마다 다른 화면이라 색인하지 않는다.
 */
export default function TimetablePage({
  schoolId: routeSchoolId, face: routeFace, entryYear, profile, onEntryYearChange, onProfileChange, onSchoolChange, onNavigate,
}: TimetablePageProps) {
  const [plans, setPlans] = useState(readPlans)
  const [schoolPicker, setSchoolPicker] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteRecord[]>(readFavorites)
  useEffect(() => subscribePlans(() => setPlans(readPlans())), [])
  useEffect(() => subscribeFavorites(() => setFavorites(readFavorites())), [])
  useEffect(() => notePlanVisit(), [])
  useEffect(() => {
    const fields = [
      ['name', 'description', timetableMeta.description], ['property', 'og:title', timetableMeta.ogTitle],
      ['property', 'og:description', timetableMeta.ogDescription], ['name', 'twitter:title', timetableMeta.xTitle],
      ['name', 'twitter:description', timetableMeta.xDescription],
    ]
    const restore = fields.map(([attribute, key, content]) => {
      const prior = document.head.querySelector<HTMLMetaElement>('meta[' + attribute + '="' + key + '"]')
      const original = prior?.content
      const node = prior ?? document.createElement('meta')
      node.setAttribute(attribute, key)
      node.content = content
      if (!prior) document.head.append(node)
      return () => { if (original === undefined) node.remove(); else node.content = original }
    })
    return () => { restore.forEach(reset => reset()) }
  }, [])
  const savedSchools = favorites.filter((item) => item.kind === 'school')
  const face: PlanFace = routeFace ?? 'week'

  // 한 주 면의 주소에 학교가 없으면 가장 최근에 고친 초안 → 첫 관심 학교 순으로 이어서 연다. 첫 그림부터 그 학교로
  // 그린다 — 주소를 고친 뒤에 다시 그리면 빈 화면이 한 번 보였다가 시간표가 펼쳐진다(2026-10-23).
  const manualPlan = plans.plans.find((item) => item.schoolId === UNSPECIFIED_SCHOOL)
  const [manualOpen, setManualOpen] = useState(false)
  const recentPlan = plans.plans.filter((item) => item.schoolId !== UNSPECIFIED_SCHOOL).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const fallbackId = recentPlan?.schoolId ?? savedSchools[0]?.id ?? null
  const restoreManual = Boolean(manualPlan || manualOpen)
  const schoolId = face === 'week' ? routeSchoolId ?? (restoreManual ? null : fallbackId) : null
  useEffect(() => {
    if (face === 'week' && !routeSchoolId && fallbackId && !restoreManual) {
      funnelMeasurement.markSelection(fallbackId, 'restore')
      onSchoolChange(fallbackId)
    }
  }, [face, routeSchoolId, fallbackId, restoreManual, onSchoolChange])

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
  useEffect(() => {
    // Do not count a transient unresolved school as another screen. Existing
    // plans are already displayed while the current public data is loading.
    if (face === 'week' && schoolId && loadingDetail && !name) return
    trackDisplayedScreen({ face, schoolId, schoolReady: Boolean(school), selectionMethod: routeSchoolId ? 'route' : 'restore' })
  }, [face, schoolId, school, loadingDetail, name, routeSchoolId])
  const shownName = school ? displaySchoolName(school.school_name, school.address, school.establishment_type) : name && displaySchoolName(name)

  // 초안을 막 만들면 화면이 시간표 중심으로 바뀐다. 아래로 내려가 있던 자리 그대로면 시간표가 위로 잘려 보인다.
  const page = useRef<HTMLElement>(null)
  useEffect(() => {
    if (face !== 'timeline') return
    const id = new URLSearchParams(window.location.search).get('item')
    if (!id) return
    const frame = requestAnimationFrame(() => {
      const target = [...(page.current?.querySelectorAll<HTMLElement>('[data-plan-item]') ?? [])].find((node) => node.dataset.planItem === id)
      if (!target) return
      target.classList.add('plan-item--focused')
      target.tabIndex = -1
      target.focus({ preventScroll: true })
      target.scrollIntoView({ block: 'center', behavior: 'auto' })
    })
    return () => cancelAnimationFrame(frame)
  }, [face, entryYear])
  const [pickMessage, setPickMessage] = useState('')
  const chips = <SchoolSelection schoolId={schoolId} onChange={(id) => {
    if (id) { setSchoolPicker(false); setManualOpen(false) }
    onSchoolChange(id)
  }} message={pickMessage} onMessage={setPickMessage}
    onSelection={(id) => funnelMeasurement.markSelection(id, 'user')} />

  const weekSchool = schoolId
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

  if ((schoolId && name) || restoreManual) {
    return <section ref={page} className="app-destination app-page content-page timetable-page gap-page" aria-labelledby="timetable-title">
      <h1 className="sr-only" id="timetable-title">우리집 일정</h1>
      <div className="gap-page-inner" data-testid="timetable-week-editor">
        <MySchedule key={schoolId ?? UNSPECIFIED_SCHOOL} school={{ id: schoolId ?? UNSPECIFIED_SCHOOL, name: name ?? '학교 미선택' }} entryYear={entryYear}
          onNavigate={onNavigate} schoolControl={<button type="button" className="gap-school-control" aria-label="학교 바꾸기" onClick={() => setSchoolPicker(true)}>
            <SchoolIcon size={16} aria-hidden="true" /><span>{shownName ?? '학교 미선택'}</span><ChevronDown size={15} aria-hidden="true" />
          </button>} />
      </div>
      {schoolPicker && <GapDialog title="학교 바꾸기" onClose={() => setSchoolPicker(false)}>
        {chips}
        <button type="button" onClick={() => { setManualOpen(true); setSchoolPicker(false); onSchoolChange(null) }}>
          {manualPlan ? '학교 없이 짠 시간표 보기' : '학교 없이 시작'}
        </button>
      </GapDialog>}
    </section>
  }

  // 학교를 고르기 전 (C안 2026-11-27): 질문 한 줄 + 학교 검색 + 학교 없이 시작. 아래 그림은 이 화면이 무엇을 보여 줄지만 알린다.
  return (
    <section ref={page} className="app-destination app-page content-page timetable-page gap-start" aria-labelledby="timetable-title">
      <div className="gap-start__inner">
        <h1 id="timetable-title">우리 아이 하교 후,<br />언제 비나요?</h1>
        {schoolId && <p className="my-help" role="status">{loadingDetail ? '학교 자료를 불러오는 중…' : '이 학교를 찾지 못했어요. 학교를 다시 골라 주세요.'}</p>}
        <div className="gap-start__pick timetable-pick"><SchoolSelection schoolId={schoolId} compact onChange={(id) => onSchoolChange(id)} message={pickMessage} onMessage={setPickMessage}
          onSelection={(id) => funnelMeasurement.markSelection(id, 'user')} /></div>
        <div className="gap-start__links">
          <button type="button" className="timetable-manual-start" onClick={() => setManualOpen(true)}>학교 없이 직접 짜기 →</button>
          <a href={VIEW_PATHS.map} onClick={(event) => followLink(event, VIEW_PATHS.map, onNavigate)}>배정 학교 찾기</a>
        </div>
        <GapMapExample />
      </div>
    </section>
  )
}
