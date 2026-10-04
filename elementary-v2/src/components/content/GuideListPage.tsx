import { useEffect, useState } from 'react'
import { BookOpenCheck, Check, ChevronRight, HelpCircle, LineChart, ThumbsUp, UserRound } from 'lucide-react'
import { GUIDE_GROUPS, GUIDE_LIST, GUIDES } from '../../content'
import { guidePath, VIEW_PATHS } from '../../utils/urlState'
import { STAGE_LABELS, stageOf, type Stage } from '../../utils/entryYear'
import { readGuides, subscribeProfile } from '../../utils/profile'
import ChecklistBanner from './ChecklistBanner'
import { followLink } from './contentLinks'
import { CURRICULUM_ENABLED, CURRICULUM_PATHS, PLANS } from '../../content/curriculum'

interface GuideListPageProps {
  onNavigate: (path: string) => void
  entryYear: number | null
}

const STAGE_ORDER: Stage[] = ['planning', 'admission']

/**
 * 입학 준비: the public manual - guides by stage, the FAQ and the data report. It
 * is the same list the static /guide page gives a crawler. The family's own setup
 * (entry year, preferences, roadmap, saved places) moved to MY on 2026-10-04; this
 * page only borrows the entry year to put the child's stage first and marks the
 * guides this device has read.
 */
export default function GuideListPage({ onNavigate, entryYear }: GuideListPageProps) {
  const selectedStage = entryYear ? stageOf(entryYear) : null
  const stages = selectedStage ? [selectedStage, ...STAGE_ORDER.filter((stage) => stage !== selectedStage)] : STAGE_ORDER
  const [read, setRead] = useState<string[]>(readGuides)
  useEffect(() => subscribeProfile(() => setRead(readGuides())), [])
  const readCount = GUIDES.filter((guide) => read.includes(guide.slug)).length

  return (
    <section className="app-destination app-page content-page" aria-labelledby="guides-title">
      <div className="content-page__inner">
        <h1 id="guides-title">{GUIDE_LIST.title}</h1>
        <p className="content-page__lead">{GUIDE_LIST.lead}</p>

        {entryYear ? null : (
          <a href={VIEW_PATHS.my} onClick={(event) => followLink(event, VIEW_PATHS.my, onNavigate)} className="content-list__item content-list__item--card">
            <span className="home-link__icon home-link__icon--sage"><UserRound size={19} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <strong>우리 아이 입학연도 정하기</strong>
              <small>MY에서 고르면 지금 볼 가이드가 먼저 나오고, 3월까지 할 일을 알려드려요</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </a>
        )}
        <ChecklistBanner onNavigate={onNavigate} />
        {CURRICULUM_ENABLED && PLANS.length ? (
          <a href={CURRICULUM_PATHS.plans} onClick={(event) => followLink(event, CURRICULUM_PATHS.plans, onNavigate)} className="content-list__item content-list__item--card" data-testid="curriculum-entry">
            <span className="home-link__icon home-link__icon--sage"><ThumbsUp size={19} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <strong>우리 아이 커리큘럼</strong>
              <small>또래 아이들이 보고 읽고 노는 것, 연령별 카드와 따봉 순위</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </a>
        ) : null}

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
