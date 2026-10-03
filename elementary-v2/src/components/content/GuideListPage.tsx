import { ChevronRight, HelpCircle, LineChart } from 'lucide-react'
import { GUIDE_GROUPS, GUIDES } from '../../content'
import { guidePath, VIEW_PATHS } from '../../utils/urlState'
import { followLink } from './contentLinks'

interface GuideListPageProps {
  onNavigate: (path: string) => void
}

export default function GuideListPage({ onNavigate }: GuideListPageProps) {
  return (
    <section className="app-destination app-page content-page" aria-labelledby="guides-title">
      <div className="content-page__inner">
        <h1 id="guides-title">입학 준비 가이드</h1>
        <p className="content-page__lead">취학통지서부터 입학까지, 시기마다 할 일을 공식 자료를 근거로 정리했습니다.</p>

        {GUIDE_GROUPS.map((group) => {
          const guides = GUIDES.filter((guide) => guide.group === group.id)
          if (!guides.length) return null
          return (
            <section key={group.id} className="content-list" aria-label={group.label}>
              <h2>{group.label}</h2>
              {guides.map((guide) => (
                <a
                  key={guide.slug}
                  href={guidePath(guide.slug)}
                  onClick={(event) => followLink(event, guidePath(guide.slug), onNavigate)}
                  className="content-list__item"
                >
                  <span className="min-w-0 flex-1">
                    <strong>{guide.title}</strong>
                    <small>{guide.description}</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </a>
              ))}
            </section>
          )
        })}

        <section className="content-list" aria-label="더 보기">
          <h2>더 보기</h2>
          <a href={VIEW_PATHS.faq} onClick={(event) => followLink(event, VIEW_PATHS.faq, onNavigate)} className="content-list__item">
            <HelpCircle size={20} aria-hidden="true" className="content-list__icon" />
            <span className="min-w-0 flex-1">
              <strong>자주 묻는 질문</strong>
              <small>취학통지서, 예비소집, 배정 학교, 이사, 입학 연기</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </a>
          <a href={VIEW_PATHS.news} onClick={(event) => followLink(event, VIEW_PATHS.news, onNavigate)} className="content-list__item">
            <LineChart size={20} aria-hidden="true" className="content-list__icon" />
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
