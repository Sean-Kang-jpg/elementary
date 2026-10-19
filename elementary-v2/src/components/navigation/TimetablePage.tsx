import { useEffect, useState } from 'react'
import { CalendarClock, Search, Star } from 'lucide-react'
import type { School } from '../../types'
import { getSchoolDetail, searchSchoolsByName } from '../../services/dataService'
import { readFavorites, subscribeFavorites, type FavoriteRecord } from '../../utils/favorites'
import { readPlans, subscribePlans } from '../../utils/schedule/plans'
import { displaySchoolName } from '../../utils/schoolName'
import { track } from '../../utils/analytics'
import SchoolDayEstimateCard from '../school/SchoolDayEstimateCard'
import MySchedule from './MySchedule'

interface TimetablePageProps {
  schoolId: string | null
  entryYear: number | null
  onSchoolChange: (schoolId: string) => void
  onNavigate: (path: string) => void
}

const STEPS = ['학교 고르기', '시간표 확인', '직접 짜기']

/**
 * 우리 아이 초등학교 시간표 미리 짜보기 (`/timetable`, 2026-10-19).
 *
 * 학교 고르기 → 그 학교의 초1 하루(하교·방과후·맞춤형·돌봄) 확인 → 초안을 만들어 주변 학원과
 * 직접 일정까지 넣기. 전에는 MY 안에서 관심 학교를 먼저 저장해야 시작할 수 있었는데, 저장과
 * 시간표는 별개라(후보 3곳 규칙) 여기서 바로 학교를 검색해 고른다. 초안은 MY와 같은 기기 저장소
 * (`plans.ts`)에 있고, MY는 그 요약만 보여 준다. 기기마다 다른 화면이라 색인하지 않는다.
 */
export default function TimetablePage({ schoolId, entryYear, onSchoolChange, onNavigate }: TimetablePageProps) {
  const [plans, setPlans] = useState(readPlans)
  const [favorites, setFavorites] = useState<FavoriteRecord[]>(readFavorites)
  useEffect(() => subscribePlans(() => setPlans(readPlans())), [])
  useEffect(() => subscribeFavorites(() => setFavorites(readFavorites())), [])
  const savedSchools = favorites.filter((item) => item.kind === 'school')

  // 주소에 학교가 없으면 내 시간표 → 가장 최근 초안 → 첫 관심 학교 순으로 이어서 연다.
  const fallbackId = plans.activeSchoolId ?? plans.plans[0]?.schoolId ?? savedSchools[0]?.id ?? null
  useEffect(() => {
    if (!schoolId && fallbackId) onSchoolChange(fallbackId)
  }, [schoolId, fallbackId, onSchoolChange])

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

  // 이 화면에서 고를 수 있는 학교: 지금 고른 학교, 초안이 있는 학교, 관심 학교.
  const picks = [
    ...(schoolId && name && !plan && !savedSchools.some((item) => item.id === schoolId) ? [{ id: schoolId, name, label: '고른 학교' }] : []),
    ...plans.plans.map((item) => ({ id: item.schoolId, name: item.schoolName, label: plans.activeSchoolId === item.schoolId ? '내 시간표' : '초안' })),
    ...savedSchools.filter((item) => !plans.plans.some((p) => p.schoolId === item.id)).map((item) => ({ id: item.id, name: item.name, label: '관심 학교' })),
  ]

  const pick = (id: string, source: string) => {
    track('timetable_school_pick', { source })
    onSchoolChange(id)
  }

  return (
    <section className="app-destination app-page content-page timetable-page" aria-labelledby="timetable-title">
      <div className="content-page__inner">
        <p className="timetable-page__kicker"><CalendarClock size={16} aria-hidden="true" /> 맞춤형 · 방과후 · 돌봄 · 주변 학원</p>
        <h1 id="timetable-title">우리 아이 초등학교 시간표 미리 짜보기</h1>
        <p className="content-page__lead">학교의 초1 하루를 먼저 보고, 입학 전에 한 주를 직접 그려 봐요.</p>

        <ol className="timetable-steps" aria-label="진행 단계">
          {STEPS.map((label, index) => (
            <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'is-done' : undefined}>
              <b>{index + 1}</b><span>{label}</span>
            </li>
          ))}
        </ol>

        <section className="timetable-pick my-card" aria-labelledby="timetable-pick-title">
          <h2 id="timetable-pick-title">1. 학교 고르기</h2>
          <SchoolSearch onPick={(id) => pick(id, 'search')} />
          {picks.length > 0 && (
            <div className="timetable-picks" aria-label="이어서 짤 학교">
              {picks.map((item) => (
                <button key={item.id} type="button" data-school-id={item.id} aria-pressed={item.id === schoolId}
                  onClick={() => pick(item.id, item.label === '관심 학교' ? 'favorite' : 'plan')}>
                  {item.label === '관심 학교' && <Star size={13} aria-hidden="true" />}
                  {displaySchoolName(item.name)}<small>{item.label}</small>
                </button>
              ))}
            </div>
          )}
          <p className="my-help">관심 학교로 저장하지 않아도 짤 수 있어요. 시간표는 이 기기의 브라우저에만 저장돼요.</p>
        </section>

        {schoolId && (loadingDetail ? (
          <p className="my-help" role="status">학교 자료를 불러오는 중…</p>
        ) : !name ? (
          <p className="my-help" role="status">이 학교를 찾지 못했어요. 위에서 다시 검색해 주세요.</p>
        ) : (
          <>
            {school && (plan ? (
              <details className="timetable-source my-card">
                <summary>2. {shownName} 운영 자료 다시 보기</summary>
                <SchoolDayEstimateCard school={school} onOpenGuide={onNavigate} />
              </details>
            ) : (
              <section className="timetable-source my-card" aria-labelledby="timetable-source-title">
                <h2 id="timetable-source-title">2. {shownName} 초1 하루 확인</h2>
                <p className="my-help">학교가 공시한 운영계획으로 만든 예상이에요. 아래에서 초안을 만들면 하교 시각이 먼저 들어가고, 강좌·돌봄·학원은 직접 골라요.</p>
                <button type="button" className="my-button timetable-skip"
                  onClick={() => document.getElementById('my-schedule-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  3. 바로 시간표 짜기로 가기
                </button>
                <SchoolDayEstimateCard school={school} onOpenGuide={onNavigate} />
              </section>
            ))}
            <MySchedule key={schoolId} school={{ id: schoolId, name, displayName: shownName ?? undefined }} entryYear={entryYear}
              saved={savedSchools.some((item) => item.id === schoolId)} />
          </>
        ))}
      </div>
    </section>
  )
}

function SchoolSearch({ onPick }: { onPick: (schoolId: string) => void }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<School[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  useEffect(() => {
    const query = term.trim()
    let active = true
    if (query.length < 2) { setResults([]); setState('idle'); return }
    setResults([])
    setState('loading')
    const timer = window.setTimeout(() => {
      searchSchoolsByName(query)
        .then((rows) => { if (active) { setResults(rows); setState('idle') } })
        .catch(() => { if (active) { setResults([]); setState('error') } })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [term])
  const query = term.trim()

  return (
    <div className="timetable-search">
      <label className="timetable-search__field">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">초등학교 이름</span>
        <input type="search" value={term} placeholder="초등학교 이름 (예: 대현초)" autoComplete="off"
          onChange={(event) => setTerm(event.target.value)} />
      </label>
      {query.length >= 2 && (
        <ul className="timetable-search__results" aria-live="polite">
          {state === 'loading' && !results.length && <li className="my-help">찾는 중…</li>}
          {state === 'error' && <li className="my-help">검색하지 못했어요. 잠시 뒤 다시 시도해 주세요.</li>}
          {state === 'idle' && !results.length && <li className="my-help">‘{query}’ 학교를 찾지 못했어요.</li>}
          {results.map((item) => (
            <li key={item.school_id}>
              <button type="button" onClick={() => { onPick(item.school_id); setTerm('') }}>
                <strong>{displaySchoolName(item.school_name, item.address)}</strong>
                <small>{item.address}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
