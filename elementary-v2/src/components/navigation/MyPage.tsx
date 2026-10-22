import { useEffect, useState } from 'react'
import { Building2, ChevronRight, GraduationCap, Map, Star, Trash2 } from 'lucide-react'
import { VIEW_PATHS } from '../../utils/urlState'
import { birthYearOf, STAGE_LABELS, stageOf } from '../../utils/entryYear'
import type { Profile } from '../../utils/profile'
import { FavoriteRecord, readFavorites, removeFavorite, subscribeFavorites } from '../../utils/favorites'
import EntryYearPicker from '../content/EntryYearPicker'
import RoadmapCard from '../content/RoadmapCard'
import ChecklistBanner from '../content/ChecklistBanner'
import { followLink } from '../content/contentLinks'
import { displaySchoolName } from '../../utils/schoolName'
import MyTimetableSummary from './MyTimetableSummary'
import MySavedAcademies from './MySavedAcademies'
import MyCandidateInfo from './MyCandidateInfo'

interface MyPageProps {
  onNavigate: (path: string) => void
  onOpenSaved: (favorite: FavoriteRecord) => void
  entryYear: number | null
  onEntryYearChange: (year: number) => void
  profile: Profile
  onProfileChange: (update: (current: Profile) => Profile) => void
}

/**
 * MY (2026-10-04): everything this device keeps for the family, in one place -
 * the entry year and preferences, the roadmap to March, checklist progress, the
 * schools and apartments saved from the map, and how many guides have been read.
 * It replaced the 즐겨찾기 tab, which was empty for nearly every visitor, and took
 * the personal half of the 입학 준비 hub so that /guide is the same public manual
 * for a visitor and a crawler. Nothing here leaves the browser (D1 option A).
 */
export default function MyPage({ onNavigate, onOpenSaved, entryYear, onEntryYearChange, profile, onProfileChange }: MyPageProps) {
  const stage = entryYear ? stageOf(entryYear) : null
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState<FavoriteRecord[]>(readFavorites)
  const [candidateTab, setCandidateTab] = useState<FavoriteRecord['kind']>('school')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => subscribeFavorites(() => setSaved(readFavorites())), [])

  const interestLabel = profile.interest.includes('private') ? '사립·국립 관심' : '공립'
  const movingLabel = profile.moving === 'planned' ? '이사 예정' : profile.moving === 'considering' ? '이사 검토 중' : null

  return (
    <section className="app-destination app-page content-page" aria-labelledby="my-title">
      <div className="content-page__inner">
        <h1 id="my-title">MY</h1>
        <p className="content-page__lead">관심 후보를 비교하고, 우리 아이의 하루를 계획해요.</p>
        <section className="my-preparation" aria-label="입학연도">
          {entryYear && stage && !editing ? (
            <div className="hub-profile">
              <span className={`stage-chip stage-chip--${stage}`}>{STAGE_LABELS[stage].short}</span>
              <p>
                <b>{entryYear}년 입학</b> · {birthYearOf(entryYear)}년생 · {interestLabel}{movingLabel ? ` · ${movingLabel}` : ''}
              </p>
              <button type="button" onClick={() => setEditing(true)} className="hub-profile__edit">바꾸기</button>
            </div>
          ) : (
            <div className="home-card">
              <EntryYearPicker value={entryYear} onChange={(year) => { onEntryYearChange(year); setEditing(false) }} />
            </div>
          )}
        </section>
        <ChecklistBanner onNavigate={onNavigate} />
        <MyTimetableSummary onNavigate={onNavigate} />
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
        <p className="my-help">학교·아파트 각각 최대 3곳. 후보 저장과 시간표 짜기는 별개예요. 기존 3곳 초과 기록은 삭제하지 않고 유지해요.</p>
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
                    try { removeFavorite(item); setMessage('관심 후보에서 삭제했어요. 시간표 초안은 유지돼요.') }
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

        {entryYear ? (
          <RoadmapCard entryYear={entryYear} profile={profile} onProfileChange={onProfileChange} onNavigate={onNavigate} source="my" />
        ) : null}

        <p className="my-note">
          이 화면의 내용은 이 기기의 브라우저에만 저장돼요. 다른 기기나 브라우저에서는 보이지 않아요.{' '}
          <a href={VIEW_PATHS.privacy} onClick={(event) => followLink(event, VIEW_PATHS.privacy, onNavigate)}>개인정보처리방침</a>
        </p>
      </div>
    </section>
  )
}
