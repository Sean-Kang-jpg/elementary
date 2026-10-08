import type { SyntheticEvent } from 'react'
import { FAQ_PAGE, FAQS } from '../../content'
import { STAGE_LABELS, stageOf } from '../../utils/entryYear'
import { VIEW_PATHS } from '../../utils/urlState'
import ShareButton from '../ui/ShareButton'
import EntryYearPicker from './EntryYearPicker'
import SourceList from './SourceList'
import AppliesTo from './AppliesTo'
import { followInternalLink } from './contentLinks'

interface FaqPageProps {
  onNavigate: (path: string) => void
  entryYear: number | null
  onEntryYearChange: (year: number) => void
  /**
   * Called each time the visitor opens a question. Which questions get opened is
   * the customer-research signal the FAQ exists to produce (PRD v2 section 11).
   */
  onOpenQuestion: (question: string) => void
}

export default function FaqPage({ onNavigate, entryYear, onEntryYearChange, onOpenQuestion }: FaqPageProps) {
  const selectedStage = entryYear ? stageOf(entryYear) : null
  // The family's own stage first; the other stays below rather than hidden, since
  // a 5-year-old's parents still ask what December will look like.
  const faqs = selectedStage
    ? [...FAQS].sort((a, b) => Number(b.stage === selectedStage) - Number(a.stage === selectedStage))
    : FAQS

  const toggled = (event: SyntheticEvent<HTMLDetailsElement>, question: string) => {
    if (event.currentTarget.open) onOpenQuestion(question)
  }

  return (
    <section className="app-destination app-page content-page" aria-labelledby="faq-title">
      <article className="content-page__inner" onClick={(event) => followInternalLink(event, onNavigate)}>
        <div className="content-page__titlebar">
          <h1 id="faq-title">{FAQ_PAGE.title}</h1>
          <ShareButton path={VIEW_PATHS.faq} title={FAQ_PAGE.title} text={FAQ_PAGE.description} label="공유" />
        </div>
        <p className="content-page__lead">{FAQ_PAGE.description}</p>
        <div className="home-card">
          <EntryYearPicker value={entryYear} onChange={onEntryYearChange} />
        </div>
        {faqs.map((faq) => (
          <section key={faq.stage} className={`faq-stage faq-stage--${faq.stage}`} aria-label={STAGE_LABELS[faq.stage].long}>
            <header className="guide-stage__header">
              <span className={`stage-chip stage-chip--${faq.stage}`}>{STAGE_LABELS[faq.stage].short}</span>
              {faq.stage === selectedStage ? <span className="home-stage__mine">우리 아이 단계</span> : null}
            </header>
            <h2 className="faq-stage__title">{faq.title}</h2>
            <AppliesTo rule={faq.rule} basisYear={faq.basisYear} />
            {faq.sections.map((section) => (
              <section key={section.heading} className="faq-section">
                <h3>{section.heading}</h3>
                {section.items.map((item) => (
                  <details key={item.question} className="faq-item" onToggle={(event) => toggled(event, item.question)}>
                    <summary>{item.question}</summary>
                    <div className="content-body" dangerouslySetInnerHTML={{ __html: item.html }} />
                  </details>
                ))}
              </section>
            ))}
            {faq.note ? <div className="content-body content-page__note" dangerouslySetInnerHTML={{ __html: faq.note }} /> : null}
            <SourceList sources={faq.sources} verifiedAt={faq.verifiedAt} />
          </section>
        ))}
      </article>
    </section>
  )
}
