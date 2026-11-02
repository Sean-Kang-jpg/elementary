import { BookOpen, HelpCircle, ShieldCheck } from 'lucide-react'
import SearchBox from '../search/SearchBox'
import EntryYearPicker from '../content/EntryYearPicker'
import PlanSummary from '../content/PlanSummary'
import type { Profile } from '../../utils/profile'
import { followLink } from '../content/contentLinks'
import { VIEW_PATHS } from '../../utils/urlState'
import copy from '../../content/home.json'
import HomeShelves from './HomeShelves'

interface HomePageProps {
  onNavigate: (path: string) => void
  entryYear: number | null
  onEntryYearChange: (year: number) => void
  profile: Profile
}

/**
 * 고민으로 시작하는 첫 화면. 일정이 있는 가족의 우리집 일정 카드는 고민 목록 위에,
 * 배정 검색창은 목록 아래에 둔다(C-04, UX-08c). 가이드 목록은 입학 준비 탭에,
 * 전체 로드맵은 우리집 일정에 있다(UX-26) — 같은 목록을 두 곳에 두지 않는다.
 *
 * 검색 결과를 고르면 선택이 바뀌고, App이 그 선택을 보고 상세 주소로 옮긴다.
 * 여기서는 지도를 그리지 않는다 — 지도는 처음 필요할 때 만들어진다.
 *
 * 문구는 content/home.json에 있다. 빌드가 같은 파일로 `/`의 정적 HTML을 만든다.
 */
export default function HomePage({ onNavigate, entryYear, onEntryYearChange, profile }: HomePageProps) {
  const guideList = entryYear ? `${VIEW_PATHS.guide}?year=${entryYear}` : VIEW_PATHS.guide

  return (
    <section className="app-destination app-page home-page home-page--worries" aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-page__inner">
          <p className="home-page__brand">{copy.brand}</p>
          <h1 id="home-title">{copy.title}</h1>
          <p className="home-page__lead">{copy.lead}</p>
          <PlanSummary entryYear={entryYear} profile={profile} onNavigate={onNavigate} />
          <HomeShelves onNavigate={onNavigate} part="worries" />
          <div id="home-assignment-search"><SearchBox className="home-page__search" /></div>
          <p className="home-hero__trust">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>{copy.noteBefore}<b>{copy.noteStrong}</b>{copy.noteAfter}</span>
          </p>
        </div>
      </div>

      <div className="home-page__inner home-page__body">
        <HomeShelves onNavigate={onNavigate} part="showcase" />

        <section className="home-card" aria-label="입학 연도 선택">
          <EntryYearPicker value={entryYear} onChange={onEntryYearChange} />
        </section>

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

        <div className="home-secondary-links">
          <a href={VIEW_PATHS.map} onClick={(event) => followLink(event, VIEW_PATHS.map, onNavigate)}>{copy.mapCardTitle}</a>
          <a href={VIEW_PATHS.area} onClick={(event) => followLink(event, VIEW_PATHS.area, onNavigate)}>{copy.areaLinkTitle}</a>
          <a href={VIEW_PATHS.learn} onClick={(event) => followLink(event, VIEW_PATHS.learn, onNavigate)}>{copy.learnCardTitle}</a>
        </div>

        <footer className="home-page__footer">
          <a href={VIEW_PATHS.privacy} onClick={(event) => followLink(event, VIEW_PATHS.privacy, onNavigate)}>개인정보처리방침</a>
        </footer>
      </div>
    </section>
  )
}
