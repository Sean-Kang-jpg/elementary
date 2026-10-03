import { ChevronRight, HelpCircle, LineChart } from 'lucide-react'
import { GUIDE_GROUPS, GUIDE_LIST, GUIDES } from '../../content'
import { guidePath, VIEW_PATHS } from '../../utils/urlState'
import { STAGE_LABELS, stageOf, type Stage } from '../../utils/entryYear'
import EntryYearPicker from './EntryYearPicker'
import { followLink } from './contentLinks'

interface GuideListPageProps {
  onNavigate: (path: string) => void
  entryYear: number | null
  onEntryYearChange: (year: number) => void
}

const STAGE_ORDER: Stage[] = ['planning', 'admission']

export default function GuideListPage({ onNavigate, entryYear, onEntryYearChange }: GuideListPageProps) {
  const selectedStage = entryYear ? stageOf(entryYear) : null
  const stages = selectedStage ? [selectedStage, ...STAGE_ORDER.filter((stage) => stage !== selectedStage)] : STAGE_ORDER

  return (
    <section className="app-destination app-page content-page" aria-labelledby="guides-title">
      <div className="content-page__inner">
        <h1 id="guides-title">{GUIDE_LIST.title}</h1>
        <p className="content-page__lead">{GUIDE_LIST.lead}</p>

        <div className="home-card">
          <EntryYearPicker value={entryYear} onChange={onEntryYearChange} />
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
                  <h2>{group.label}</h2>
                  <ol className="guide-timeline">
                    {guides.map((guide) => (
                      <li key={guide.slug}>
                        <a
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
                      </li>
                    ))}
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
