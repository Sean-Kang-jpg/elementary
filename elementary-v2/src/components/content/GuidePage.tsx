import { ArrowLeft } from 'lucide-react'
import type { Guide } from '../../content'
import { VIEW_PATHS } from '../../utils/urlState'
import SourceList from './SourceList'
import { followInternalLink, followLink } from './contentLinks'

interface GuidePageProps {
  guide: Guide
  onNavigate: (path: string) => void
}

/**
 * One guide. The body is HTML the build produced from our own markdown
 * (scripts/build-content.mjs), not user input, which is why it is set directly.
 */
export default function GuidePage({ guide, onNavigate }: GuidePageProps) {
  return (
    <section className="app-destination app-page content-page" aria-labelledby="guide-title">
      <article className="content-page__inner" onClick={(event) => followInternalLink(event, onNavigate)}>
        <a href={VIEW_PATHS.guide} onClick={(event) => followLink(event, VIEW_PATHS.guide, onNavigate)} className="content-page__back">
          <ArrowLeft size={16} aria-hidden="true" />입학 준비 가이드
        </a>
        <h1 id="guide-title">{guide.title}</h1>
        {guide.scope ? <p className="content-page__scope">{guide.scope}</p> : null}
        <div className="content-body" dangerouslySetInnerHTML={{ __html: guide.html }} />
        <SourceList sources={guide.sources} verifiedAt={guide.verifiedAt} />
      </article>
    </section>
  )
}
