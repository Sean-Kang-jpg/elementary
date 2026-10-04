import { BookOpen, ChevronRight, HelpCircle, Map, ShieldCheck } from 'lucide-react'
import SearchBox from '../search/SearchBox'
import EntryYearPicker from '../content/EntryYearPicker'
import RoadmapSummary from '../content/RoadmapSummary'
import type { Profile } from '../../utils/profile'
import SchoolIllustration from '../content/SchoolIllustration'
import { followLink } from '../content/contentLinks'
import { guidePath, VIEW_PATHS } from '../../utils/urlState'
import { STAGE_LABELS, stageOf, type Stage } from '../../utils/entryYear'
import { guidesOf } from '../../content'
import copy from '../../content/home.json'

interface HomePageProps {
  onNavigate: (path: string) => void
  entryYear: number | null
  onEntryYearChange: (year: number) => void
  profile: Profile
}

const STAGE_ORDER: Stage[] = ['planning', 'admission']

/**
 * 첫 화면. 맨 위는 배정 검색창이다 (PRD 6.5절, ADR-008). 그 아래에서 아이의
 * 입학연도를 고르면 그 단계의 가이드가 앞으로 나온다.
 *
 * 검색 결과를 고르면 선택이 바뀌고, App이 그 선택을 보고 상세 주소로 옮긴다.
 * 여기서는 지도를 그리지 않는다 — 지도는 처음 필요할 때 만들어진다.
 *
 * 문구는 content/home.json에 있다. 빌드가 같은 파일로 `/`의 정적 HTML을 만든다.
 */
export default function HomePage({ onNavigate, entryYear, onEntryYearChange, profile }: HomePageProps) {
  const selectedStage = entryYear ? stageOf(entryYear) : null
  const stages = selectedStage ? [selectedStage, ...STAGE_ORDER.filter((stage) => stage !== selectedStage)] : STAGE_ORDER
  const guideList = entryYear ? `${VIEW_PATHS.guide}?year=${entryYear}` : VIEW_PATHS.guide

  return (
    <section className="app-destination app-page home-page" aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-page__inner">
          <SchoolIllustration className="home-hero__art" />
          <p className="home-page__brand">{copy.brand}</p>
          <h1 id="home-title">{copy.title}</h1>
          <p className="home-page__lead">{copy.lead}</p>
          <SearchBox className="home-page__search" />
          <p className="home-hero__trust">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>{copy.noteBefore}<b>{copy.noteStrong}</b>{copy.noteAfter}</span>
          </p>
        </div>
      </div>

      <div className="home-page__inner home-page__body">
        <section className="home-card" aria-label="입학 연도 선택">
          <EntryYearPicker value={entryYear} onChange={onEntryYearChange} />
        </section>

        {entryYear ? <RoadmapSummary entryYear={entryYear} profile={profile} onNavigate={onNavigate} /> : null}

        {stages.map((stage) => {
          const guides = guidesOf(stage)
          if (!guides.length) return null
          const isMine = stage === selectedStage
          return (
            <section key={stage} className={`home-stage home-stage--${stage} ${isMine ? 'home-stage--mine' : ''}`} aria-labelledby={`home-stage-${stage}`}>
              <header>
                <span className={`stage-chip stage-chip--${stage}`}>{STAGE_LABELS[stage].short}</span>
                {isMine ? <span className="home-stage__mine">우리 아이 단계</span> : null}
              </header>
              <h2 id={`home-stage-${stage}`}>{STAGE_LABELS[stage].homeTitle}</h2>
              <ul>
                {guides.map((guide) => (
                  <li key={guide.slug}>
                    <a href={guidePath(guide.slug)} onClick={(event) => followLink(event, guidePath(guide.slug), onNavigate)}>
                      <span>{guide.title}</span>
                      <ChevronRight size={17} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <div className="home-links">
          <a href={guideList} onClick={(event) => followLink(event, guideList, onNavigate)} className="home-link">
            <span className="home-link__icon home-link__icon--peach"><BookOpen size={19} aria-hidden="true" /></span>
            <span><strong>입학 준비 가이드</strong><small>시기별로 할 일을 공식 자료로</small></span>
          </a>
          <a href={VIEW_PATHS.faq} onClick={(event) => followLink(event, VIEW_PATHS.faq, onNavigate)} className="home-link">
            <span className="home-link__icon home-link__icon--sage"><HelpCircle size={19} aria-hidden="true" /></span>
            <span><strong>자주 묻는 질문</strong><small>이사·배정·취학통지서</small></span>
          </a>
        </div>

        <a href={VIEW_PATHS.map} onClick={(event) => followLink(event, VIEW_PATHS.map, onNavigate)} className="home-page__card">
          <span className="home-page__card-icon"><Map size={20} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <strong>{copy.mapCardTitle}</strong>
            <small>{copy.mapCardBody}</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>

        <footer className="home-page__footer">
          <a href={VIEW_PATHS.privacy} onClick={(event) => followLink(event, VIEW_PATHS.privacy, onNavigate)}>개인정보처리방침</a>
        </footer>
      </div>
    </section>
  )
}
