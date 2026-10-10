import { ArrowLeft, ChevronRight, MessageCircle } from 'lucide-react'
import {
  findGuide,
  findLearning,
  LEARNING_CATEGORIES,
  SCHOOL_LINK_LABELS,
  subcategoryLabel,
  type LearningItem,
  type LearningSignal,
} from '../../content'
import { guidePath, learnPath, VIEW_PATHS } from '../../utils/urlState'
import ShareButton from '../ui/ShareButton'
import SourceList from './SourceList'
import { followInternalLink, followLink } from './contentLinks'

interface LearnItemPageProps {
  item: LearningItem
  onNavigate: (path: string) => void
}

const TONE_LABELS: Record<LearningSignal['tone'], string> = {
  positive: '잘 맞았다는 반응',
  negative: '아쉬웠다는 반응',
  conditional: '조건에 따라 달랐다는 반응',
}

const ageRange = (ages: number[]): string => {
  const sorted = [...ages].sort((a, b) => a - b)
  const last = sorted[sorted.length - 1]
  return sorted[0] !== last ? `만 ${sorted[0]}~${last}세` : `만 ${sorted[0]}세`
}

/** 공식 사실과 어디초 판단을 구분해 알린다(P2-07). 학교 단원 절이 있는 글만 앞부분을 붙인다. */
export const editorialNote = (html: string): string => (html.includes('<h2>학교에서는 이렇게 배워요</h2>')
  ? '‘학교에서는 이렇게 배워요’는 아래 근거 자료의 내용이고, ‘좋은 점·아쉬운 점·우리 집이라면’은 그 사실을 바탕으로 한 어디초의 편집 판단입니다.'
  : '‘좋은 점·아쉬운 점·우리 집이라면’은 아래 근거 자료를 바탕으로 한 어디초의 편집 판단입니다.')

/** 다음에 볼 것: 학습 콘텐츠와 가이드를 같은 모양으로. 빌드가 존재를 확인했다. */
const relatedEntry = (path: string): { path: string; title: string } | null => {
  const learn = path.match(/^\/learn\/(.+)$/)
  if (learn) {
    const item = findLearning(learn[1])
    return item ? { path: learnPath(item.slug), title: item.title } : null
  }
  const guide = path.match(/^\/guide\/(.+)$/)
  const found = guide ? findGuide(guide[1]) : null
  return found ? { path: guidePath(found.slug), title: found.title } : null
}

/**
 * 학습·생활 준비 콘텐츠 하나 (P2-03 공통 템플릿). 질문 → 어디초 요약 → 대상·시기·학교 연계 →
 * 본문(좋은 점 / 아쉬운 점 / 우리 집이라면) → 부모 반응 → 다음에 볼 것 → 근거.
 * 투표·한줄 경험은 P4에서 붙인다 — 동작하지 않는 버튼을 미리 두지 않는다.
 * 본문 HTML은 빌드가 우리 마크다운으로 만든 것이라 그대로 넣는다.
 */
export default function LearnItemPage({ item, onNavigate }: LearnItemPageProps) {
  const category = LEARNING_CATEGORIES.find((entry) => entry.id === item.category)
  const backPath = category?.menu === 'guide' ? VIEW_PATHS.guide : VIEW_PATHS.learn
  const backLabel = category?.menu === 'guide' ? '입학 준비 가이드' : '학습 준비'
  const related = item.related.map(relatedEntry).filter((entry): entry is { path: string; title: string } => entry !== null)

  return (
    <section className="app-destination app-page content-page" aria-labelledby="learn-item-title">
      <article className="content-page__inner" onClick={(event) => followInternalLink(event, onNavigate)}>
        <div className="content-page__topbar">
          <a href={backPath} onClick={(event) => followLink(event, backPath, onNavigate)} className="content-page__back">
            <ArrowLeft size={16} aria-hidden="true" />{backLabel}
          </a>
          <ShareButton path={learnPath(item.slug)} title={item.title} text={item.description} label="공유" />
        </div>
        {item.status !== 'published' ? (
          <p className="learn-status" role="note">{item.status === 'review' ? '검수 중' : '초안'} — 운영 사이트에는 보이지 않습니다</p>
        ) : null}
        <span className="learn-category">{category?.label} · {subcategoryLabel(item)}</span>
        <h1 id="learn-item-title">{item.title}</h1>

        <div className="learn-answer">
          <strong>어디초 요약</strong>
          <p>{item.answer}</p>
        </div>

        <dl className="learn-facts">
          <div><dt>대상</dt><dd>{ageRange(item.ages)}</dd></div>
          <div><dt>시기</dt><dd>{item.timing}</dd></div>
          {item.schoolLink ? (
            <div>
              <dt>학교와의 연결</dt>
              <dd>
                <span className={`learn-link learn-link--${item.schoolLink.level}`}>{SCHOOL_LINK_LABELS[item.schoolLink.level]}</span>
                {item.schoolLink.basis ? <span className="learn-link__basis">{item.schoolLink.basis}</span> : null}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="content-body" dangerouslySetInnerHTML={{ __html: item.html }} />
        <p className="learn-editorial-note">{editorialNote(item.html)}</p>

        <section className="learn-signals" aria-labelledby="learn-signals-title">
          <h2 id="learn-signals-title"><MessageCircle size={17} aria-hidden="true" />부모들의 반응</h2>
          {item.signals.length ? (
            <>
              <ul>
                {item.signals.map((signal) => (
                  <li key={signal.url}>
                    <span className={`learn-signal__tone learn-signal__tone--${signal.tone}`}>{TONE_LABELS[signal.tone]}</span>
                    <span>{signal.summary}</span>
                    <a href={signal.url} target="_blank" rel="noopener noreferrer">원문</a>
                  </li>
                ))}
              </ul>
              <p className="learn-signals__note">사람이 직접 읽고 우리 말로 요약했습니다. 모두 제휴·협찬 표기가 확인되지 않은 반응입니다. 표기가 없다고 이해관계가 없다고 보장할 수는 없습니다.</p>
            </>
          ) : (
            <p className="learn-signals__empty">아직 모은 반응이 없어요. 사람이 직접 읽고 제휴·협찬 표기를 확인한 반응만 덧붙입니다.</p>
          )}
        </section>

        {related.length ? (
          <nav className="content-list" aria-label="다음에 볼 것">
            <h2>다음에 볼 것</h2>
            {related.map((entry) => (
              <a key={entry.path} href={entry.path} onClick={(event) => followLink(event, entry.path, onNavigate)} className="content-list__item content-list__item--card">
                <span className="min-w-0 flex-1"><strong>{entry.title}</strong></span>
                <ChevronRight size={18} aria-hidden="true" />
              </a>
            ))}
          </nav>
        ) : null}

        <SourceList sources={item.sources} verifiedAt={item.verifiedAt} />
      </article>
    </section>
  )
}
