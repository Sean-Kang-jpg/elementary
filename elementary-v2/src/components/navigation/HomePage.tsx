import { BookOpen, HelpCircle } from 'lucide-react'
import { followLink } from '../content/contentLinks'
import { planPath, VIEW_PATHS } from '../../utils/urlState'
import { track } from '../../utils/analytics'
import copy from '../../content/home.json'
import HomeShelves from './HomeShelves'

interface HomePageProps {
  onNavigate: (path: string) => void
  entryYear: number | null
}

export default function HomePage({ onNavigate, entryYear }: HomePageProps) {
  const guideList = entryYear ? `${VIEW_PATHS.guide}?year=${entryYear}` : VIEW_PATHS.guide
  const week = planPath('week')

  return (
    <section className="app-destination app-page home-page home-page--worries" aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-page__inner">
          <p className="home-page__brand">{copy.brand}</p>
          <h1 id="home-title">{copy.title}</h1>
          <p className="home-page__lead">{copy.lead}</p>
          <div className="home-hero__actions">
            <a className="my-button my-button--primary" href={week} onClick={(event) => {
              track('home_shelf_click', { shelf: 'banner', item: 'timetable' })
              followLink(event, week, onNavigate)
            }}>{copy.timetableAction}</a>
            <a className="my-button" href={VIEW_PATHS.map} onClick={(event) => followLink(event, VIEW_PATHS.map, onNavigate)}>{copy.assignmentAction}</a>
          </div>
        </div>
      </div>

      <div className="home-page__inner home-page__body">
        <HomeShelves onNavigate={onNavigate} />

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
