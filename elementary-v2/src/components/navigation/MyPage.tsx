import { useEffect, useState } from 'react'
import { BookOpenCheck, Building2, ChevronRight, GraduationCap, Map, Star, Trash2 } from 'lucide-react'
import { GUIDES } from '../../content'
import { VIEW_PATHS } from '../../utils/urlState'
import { birthYearOf, STAGE_LABELS, stageOf } from '../../utils/entryYear'
import { readGuides, subscribeProfile, type Profile } from '../../utils/profile'
import { FavoriteRecord, readFavorites, removeFavorite, subscribeFavorites } from '../../utils/favorites'
import EntryYearPicker from '../content/EntryYearPicker'
import RoadmapCard from '../content/RoadmapCard'
import ChecklistBanner from '../content/ChecklistBanner'
import { followLink } from '../content/contentLinks'

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
  const [read, setRead] = useState<string[]>(readGuides)
  useEffect(() => subscribeFavorites(() => setSaved(readFavorites())), [])
  useEffect(() => subscribeProfile(() => setRead(readGuides())), [])
  const readCount = GUIDES.filter((guide) => read.includes(guide.slug)).length

  const interestLabel = profile.interest.includes('private') ? '사립·국립 관심' : '공립'
  const movingLabel = profile.moving === 'planned' ? '이사 예정' : profile.moving === 'considering' ? '이사 검토 중' : null

  return (
    <section className="app-destination app-page content-page" aria-labelledby="my-title">
      <div className="content-page__inner">
        <h1 id="my-title">MY</h1>
        <p className="content-page__lead">우리 아이 입학 준비와 저장한 학교·아파트를 모았어요.</p>

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
            <EntryYearPicker
              value={entryYear}
              onChange={(year) => { onEntryYearChange(year); setEditing(false) }}
            />
          </div>
        )}

        <div className="hub-guides-head">
          <h2>저장한 학교·아파트</h2>
          <span><Star size={15} aria-hidden="true" /> {saved.length}곳</span>
        </div>
        {saved.length === 0 ? (
          <div className="my-saved__empty">
            <p>학교나 아파트 상세에서 <Star size={14} aria-hidden="true" /> 를 누르면 여기에 모여요. 이사를 검토할 때 후보를 나란히 두고 볼 수 있어요.</p>
            <a href={VIEW_PATHS.map} onClick={(event) => followLink(event, VIEW_PATHS.map, onNavigate)}>
              <Map size={16} aria-hidden="true" /> 지도에서 찾기
            </a>
          </div>
        ) : (
          <ul className="my-saved">
            {saved.map((item) => {
              const Icon = item.kind === 'school' ? GraduationCap : Building2
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <button type="button" onClick={() => onOpenSaved(item)} className="my-saved__open">
                    <span className={`app-page__entity-icon ${item.kind === 'apartment' ? 'app-page__entity-icon--apartment' : ''}`}><Icon size={18} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <strong>{item.name}</strong>
                      <small>{item.kind === 'apartment' && item.schoolName ? `배정 ${item.schoolName}` : item.address || '학교 정보'}</small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => removeFavorite(item)} className="my-saved__remove" aria-label={`${item.name} 저장 삭제`}>
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {entryYear ? (
          <RoadmapCard entryYear={entryYear} profile={profile} onProfileChange={onProfileChange} onNavigate={onNavigate} source="my" />
        ) : (
          <ChecklistBanner onNavigate={onNavigate} />
        )}

        <a href={VIEW_PATHS.guide} onClick={(event) => followLink(event, VIEW_PATHS.guide, onNavigate)} className="content-list__item content-list__item--card my-guides">
          <span className="home-link__icon home-link__icon--peach"><BookOpenCheck size={19} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <strong>입학 준비 가이드</strong>
            <small>{GUIDES.length}편 중 {readCount}편 읽음</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>

        <p className="my-note">
          이 화면의 내용은 이 기기의 브라우저에만 저장돼요. 다른 기기나 브라우저에서는 보이지 않아요.{' '}
          <a href={VIEW_PATHS.privacy} onClick={(event) => followLink(event, VIEW_PATHS.privacy, onNavigate)}>개인정보처리방침</a>
        </p>
      </div>
    </section>
  )
}
