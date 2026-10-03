import type { SyntheticEvent } from 'react'
import { FAQ } from '../../content'
import SourceList from './SourceList'
import { followInternalLink } from './contentLinks'

interface FaqPageProps {
  onNavigate: (path: string) => void
  /**
   * Called each time the visitor opens a question. Which questions get opened is
   * the customer-research signal the FAQ exists to produce (PRD v2 section 11).
   */
  onOpenQuestion: (question: string) => void
}

export default function FaqPage({ onNavigate, onOpenQuestion }: FaqPageProps) {
  const toggled = (event: SyntheticEvent<HTMLDetailsElement>, question: string) => {
    if (event.currentTarget.open) onOpenQuestion(question)
  }

  return (
    <section className="app-destination app-page content-page" aria-labelledby="faq-title">
      <article className="content-page__inner" onClick={(event) => followInternalLink(event, onNavigate)}>
        <h1 id="faq-title">{FAQ.title}</h1>
        <p className="content-page__lead">{FAQ.description}</p>
        {FAQ.sections.map((section) => (
          <section key={section.heading} className="faq-section">
            <h2>{section.heading}</h2>
            {section.items.map((item) => (
              <details key={item.question} className="faq-item" onToggle={(event) => toggled(event, item.question)}>
                <summary>{item.question}</summary>
                <div className="content-body" dangerouslySetInnerHTML={{ __html: item.html }} />
              </details>
            ))}
          </section>
        ))}
        {FAQ.note ? <div className="content-body content-page__note" dangerouslySetInnerHTML={{ __html: FAQ.note }} /> : null}
        <SourceList sources={FAQ.sources} verifiedAt={FAQ.verifiedAt} />
      </article>
    </section>
  )
}
