import { useEffect, useState } from 'react'
import { Building2, CalendarDays, ChevronRight, GraduationCap, Map, Star, Trash2 } from 'lucide-react'
import { planPath, VIEW_PATHS } from '../../utils/urlState'
import type { Profile } from '../../utils/profile'
import { FavoriteRecord, readFavorites, removeFavorite, subscribeFavorites } from '../../utils/favorites'
import EntryProfile from '../content/EntryProfile'
import { followLink } from '../content/contentLinks'
import { displaySchoolName } from '../../utils/schoolName'
import MySavedAcademies from './MySavedAcademies'
import MyCandidateInfo from './MyCandidateInfo'

interface MyPageProps {
  onNavigate: (path: string) => void
  onOpenSaved: (favorite: FavoriteRecord) => void
  entryYear: number | null
  onEntryYearChange: (year: number) => void
  profile: Profile
}

/**
 * MY (2026-10-04): what this device keeps about the family - the entry year and
 * preferences, the schools and apartments saved from the map, saved academies.
 * Since UX-26 (2026-11-01) the plan itself - the roadmap to March, checklist
 * progress and the week timetables - lives in 우리집 일정 (`/timetable`), and MY
 * only points there. Nothing here leaves the browser (D1 option A).
 */
export default function MyPage({ onNavigate, onOpenSaved, entryYear, onEntryYearChange, profile }: MyPageProps) {
  const [saved, setSaved] = useState<FavoriteRecord[]>(readFavorites)
  const [candidateTab, setCandidateTab] = useState<FavoriteRecord['kind']>('school')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => subscribeFavorites(() => setSaved(readFavorites())), [])
  const plan = planPath('timeline')

  return (
    <section className="app-destination app-page content-page" aria-labelledby="my-title">
      <div className="content-page__inner">
        <h1 id="my-title">MY</h1>
        <p className="content-page__lead">우리 집 설정과 관심 후보를 모아 둬요.</p>
        <EntryProfile entryYear={entryYear} profile={profile} onEntryYearChange={onEntryYearChange} />
        <a href={plan} onClick={(event) => followLink(event, plan, onNavigate)} className="content-list__item content-list__item--card my-plan-link">
          <span className="home-link__icon home-link__icon--sage"><CalendarDays size={19} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <strong>우리집 일정</strong>
            <small>입학까지 할 일, 체크리스트, 우리 아이 한 주 시간표는 우리집 일정에 있어요</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>
        <MySavedAcademies onNavigate={onNavigate} />

        <div className="hub-guides-head">
          <h2>관심 후보</h2>
          <span><Star size={15} aria-hidden="true" /> {saved.length}곳</span>
        </div>
        <div className="my-candidate-tabs" aria-label="관심 후보 유형">
          {(['school', 'apartment'] as const).map((kind) => <button key={kind} type="button"
            aria-pressed={candidateTab === kind} onClick={() => { setCandidateTab(kind); setExpandedId(null) }}>
            {kind === 'school' ? '학교' : '아파트'} {saved.filter((item) => item.kind === kind).length}/3
          </button>)}
        </div>
        <p className="my-help">학교·아파트 각각 최대 3곳. 학교는 시간표·배움/돌봄에서 함께 사용해요. 학교를 제거하면 해당 시간표도 삭제돼요. 기존 3곳 초과 기록은 삭제하지 않고 유지해요.</p>
        {!saved.some((item) => item.kind === candidateTab) ? (
          <div className="my-saved__empty">
            <p>학교나 아파트 상세에서 <Star size={14} aria-hidden="true" /> 를 누르면 관심 후보에 모여요.</p>
            <a href={VIEW_PATHS.map} onClick={(event) => followLink(event, VIEW_PATHS.map, onNavigate)}><Map size={16} aria-hidden="true" /> 지도에서 찾기</a>
          </div>
        ) : (
          <ul className="my-saved my-candidates">
            {saved.filter((item) => item.kind === candidateTab).map((item) => {
              const Icon = item.kind === 'school' ? GraduationCap : Building2
              const key = `${item.kind}-${item.id}`
              return <li key={key}>
                <div className="my-candidate-head">
                  <button type="button" onClick={() => onOpenSaved(item)} className="my-saved__open">
                    <span className={`app-page__entity-icon ${item.kind === 'apartment' ? 'app-page__entity-icon--apartment' : ''}`}><Icon size={18} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><strong>{item.kind === 'school' ? displaySchoolName(item.name, item.address) : item.name}</strong>
                      <small>{item.kind === 'apartment' && item.schoolName ? `배정 ${displaySchoolName(item.schoolName, item.address)}` : item.address || '학교 정보'}</small></span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                  <button type="button" className="my-saved__remove" aria-label={`${item.name} 저장 삭제`} onClick={() => {
                    try { if (removeFavorite(item)) setMessage('목록에서 제거했어요. 학교의 시간표도 함께 삭제돼요.') }
                    catch { setMessage('삭제하지 못했어요. 브라우저 저장 설정을 확인해 주세요.') }
                  }}><Trash2 size={17} aria-hidden="true" /></button>
                </div>
                <button type="button" className="my-candidate-toggle" aria-expanded={expandedId === key} aria-controls={`candidate-${key}`}
                  onClick={() => setExpandedId(expandedId === key ? null : key)}>{item.kind === 'school' ? '돌봄·방과후 / 교육환경' : '배정 학교 / 교육환경'} {expandedId === key ? '접기' : '보기'}</button>
                <div id={`candidate-${key}`}>{expandedId === key && <MyCandidateInfo item={item} onNavigate={onNavigate} onOpenSaved={onOpenSaved} />}</div>
              </li>
            })}
          </ul>
        )}
        <p role="status" className="my-help">{message}</p>

        <p className="my-note">
          이 화면의 내용은 이 기기의 브라우저에만 저장돼요. 다른 기기나 브라우저에서는 보이지 않아요.{' '}
          <a href={VIEW_PATHS.privacy} onClick={(event) => followLink(event, VIEW_PATHS.privacy, onNavigate)}>개인정보처리방침</a>
        </p>
      </div>
    </section>
  )
}
