import { useEffect, useState } from 'react'
import { BookOpenCheck, Check, ChevronRight, HelpCircle, LineChart } from 'lucide-react'
import { GUIDE_GROUPS, GUIDE_LIST, GUIDES } from '../../content'
import { guidePath, VIEW_PATHS } from '../../utils/urlState'
import { birthYearOf, STAGE_LABELS, stageOf, type Stage } from '../../utils/entryYear'
import { readGuides, subscribeProfile, type Profile } from '../../utils/profile'
import EntryYearPicker from './EntryYearPicker'
import RoadmapCard from './RoadmapCard'
import ChecklistBanner from './ChecklistBanner'
import { followLink } from './contentLinks'

interface GuideListPageProps {
  onNavigate: (path: string) => void
  entryYear: number | null
  onEntryYearChange: (year: number) => void
  profile: Profile
  onProfileChange: (update: (current: Profile) => Profile) => void
}

const STAGE_ORDER: Stage[] = ['planning', 'admission']

/**
 * 입학 준비: the personal hub behind the bottom navigation (2026-10-04). The home is
 * the front door - search first, a short summary of the child's stage - and this
 * is where the family's own setup lives: the entry year and preferences, the
 * whole roadmap to March, checklist progress, and the guides with what this
 * device has already read. Everything personal stays on the device (D1 option A).
 */
export default function GuideListPage({ onNavigate, entryYear, onEntryYearChange, profile, onProfileChange }: GuideListPageProps) {
  const selectedStage = entryYear ? stageOf(entryYear) : null
  const stages = selectedStage ? [selectedStage, ...STAGE_ORDER.filter((stage) => stage !== selectedStage)] : STAGE_ORDER
  const [editing, setEditing] = useState(false)
  const [read, setRead] = useState<string[]>(readGuides)
  useEffect(() => subscribeProfile(() => setRead(readGuides())), [])
  const readCount = GUIDES.filter((guide) => read.includes(guide.slug)).length

  const interestLabel = profile.interest.includes('private') ? '사립·국립 관심' : '공립'
  const movingLabel = profile.moving === 'planned' ? '이사 예정' : profile.moving === 'considering' ? '이사 검토 중' : null

  return (
    <section className="app-destination app-page content-page" aria-labelledby="guides-title">
      <div className="content-page__inner">
        <h1 id="guides-title">{GUIDE_LIST.title}</h1>
        <p className="content-page__lead">{GUIDE_LIST.lead}</p>

        {entryYear && !editing ? (
          <div className="hub-profile">
            <span className={`stage-chip stage-chip--${selectedStage}`}>{STAGE_LABELS[selectedStage!].short}</span>
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

        {entryYear ? (
          <RoadmapCard entryYear={entryYear} profile={profile} onProfileChange={onProfileChange} onNavigate={onNavigate} source="guides" />
        ) : (
          <ChecklistBanner onNavigate={onNavigate} />
        )}

        <div className="hub-guides-head">
          <h2>시기별 가이드</h2>
          <span><BookOpenCheck size={15} aria-hidden="true" /> {readCount}/{GUIDES.length} 읽음</span>
        </div>

        {stages.map((stage) => (
          <section key={stage} className={`guide-stage guide-stage--${stage} ${stage === selectedStage ? 'guide-stage--mine' : ''}`} aria-label={STAGE_LABELS[stage].long}>
            <header className="guide-stage__header">
              <span className={`stage-chip stage-chip--${stage}`}>{STAGE_LABELS[stage].short}</span>
              {stage === selectedStage ? <span className="home-stage__mine">우리 아이 단계</span> : null}
            </header>
            {GUIDE_GROUPS.filter((group) => group.stage === stage).map((group) => {
              const guides = GUIDES.filter((guide) => guide.group === group.id)
              if (!guides.length) return null
              return (
                <div key={group.id} className="content-list">
                  <h3 className="content-list__title">{group.label}</h3>
                  <ol className="guide-timeline">
                    {guides.map((guide) => {
                      const isRead = read.includes(guide.slug)
                      return (
                        <li key={guide.slug} className={isRead ? 'is-read' : ''}>
                          <a
                            href={guidePath(guide.slug)}
                            onClick={(event) => followLink(event, guidePath(guide.slug), onNavigate)}
                            className="content-list__item"
                          >
                            <span className="min-w-0 flex-1">
                              <strong>{guide.title}</strong>
                              <small>{guide.description}</small>
                            </span>
                            {isRead ? <span className="content-list__read"><Check size={12} strokeWidth={3} aria-hidden="true" />읽음</span> : null}
                            <ChevronRight size={18} aria-hidden="true" />
                          </a>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )
            })}
          </section>
        ))}

        <section className="content-list" aria-label="더 보기">
          <h2>더 보기</h2>
          <a href={VIEW_PATHS.faq} onClick={(event) => followLink(event, VIEW_PATHS.faq, onNavigate)} className="content-list__item content-list__item--card">
            <span className="home-link__icon home-link__icon--sage"><HelpCircle size={19} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <strong>자주 묻는 질문</strong>
              <small>이사 시기, 배정 학교, 취학통지서, 예비소집, 입학 연기</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </a>
          <a href={VIEW_PATHS.news} onClick={(event) => followLink(event, VIEW_PATHS.news, onNavigate)} className="content-list__item content-list__item--card">
            <span className="home-link__icon home-link__icon--peach"><LineChart size={19} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <strong>데이터 리포트</strong>
              <small>학교별 배정 아파트의 세대수·연식·주차를 한눈에</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </a>
        </section>
      </div>
    </section>
  )
}
