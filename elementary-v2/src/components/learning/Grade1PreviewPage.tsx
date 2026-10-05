import { useEffect, useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import {
  ITEM_TYPE_LABELS,
  LEARNING_AUDIENCE,
  LEARNING_VERIFIED_AT,
  SCHOOL_LINK_LABELS,
  SUBJECTS,
  itemsForStage,
  sourcesOf,
  type LearningItem,
  type Stage,
} from '../../content/learning'
import { track } from '../../utils/analytics'

const LEVEL_KEY = 'wherecho:grade1-level-v1'

/** The parent's pick of where the child is now, per subject. This device only (PRD v2 D1). */
const readLevels = (): Record<string, number> => {
  try {
    return JSON.parse(window.localStorage.getItem(LEVEL_KEY) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}
const writeLevels = (levels: Record<string, number>) => {
  try { window.localStorage.setItem(LEVEL_KEY, JSON.stringify(levels)) } catch { /* storage blocked: holds for this visit */ }
}

const ItemCard = ({ item }: { item: LearningItem }) => {
  const link = SCHOOL_LINK_LABELS[item.schoolLink]
  const reviews = item.evidence.reviews
  const good = reviews.filter((review) => review.good).length
  const bad = reviews.filter((review) => review.bad).length
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3" data-testid="learning-item">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        <span className={`rounded px-1.5 py-0.5 ${link.tone}`}>{link.label}</span>
        <span className="text-gray-500">{ITEM_TYPE_LABELS[item.type]}{item.cost ? ` · ${item.cost}` : ''} · 부모 개입 {item.parentInvolvement}</span>
      </div>
      <strong className="mt-1.5 block text-sm text-gray-950">{item.name}</strong>
      <p className="mt-1 text-sm text-gray-700">{item.role}</p>
      <dl className="mt-2 space-y-1 text-xs text-gray-600">
        <div><dt className="inline font-semibold text-gray-700">이런 아이에게 </dt><dd className="inline">{item.forWhom}</dd></div>
        <div><dt className="inline font-semibold text-gray-700">학교와의 연결 </dt><dd className="inline">{item.schoolLinkBasis}</dd></div>
        <div>
          <dt className="inline font-semibold text-gray-700">근거 </dt>
          <dd className="inline">
            {item.evidence.public.length ? `공공 추천 ${item.evidence.public.length}` : null}
            {item.evidence.public.length ? ' · ' : null}
            {reviews.length ? `잘 맞았던 사례 ${good} · 아쉬웠던 사례 ${bad}` : '사용 후기 수집 중'}
          </dd>
        </div>
      </dl>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('click_learning_item', { item_key: item.key, subject: item.subject, school_link: item.schoolLink })}
          className="inline-flex items-center gap-1 font-semibold text-blue-700"
        >
          {item.urlLabel ?? '바로 가기'} <ExternalLink size={12} aria-hidden="true" />
        </a>
        {item.extraLinks?.map((extra) => (
          <a key={extra.url} href={extra.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700">
            {extra.label} <ExternalLink size={12} aria-hidden="true" />
          </a>
        ))}
        {item.evidence.public.map((entry) => (
          <a key={entry.url + (entry.page ?? '')} href={entry.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 underline">
            출처{entry.page ? ` ${entry.page}` : ''}
          </a>
        ))}
      </div>
    </li>
  )
}

const StageSection = ({ stage, open, onToggle, outsideSchool }: { stage: Stage; open: boolean; onToggle: () => void; outsideSchool?: boolean }) => {
  const items = itemsForStage(stage.id)
  return (
    <li className={`rounded-lg border ${open ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-3 text-left">
        <span className="min-w-0 flex-1">
          <strong className="block text-sm text-gray-950">{stage.label}</strong>
          <span className="text-xs text-gray-600">{stage.summary}</span>
        </span>
        {!outsideSchool && stage.units.length ? (
          <span className="flex-none text-[11px] font-semibold text-gray-500">{[...new Set(stage.units.map((unit) => unit.term))].join(' · ')}</span>
        ) : null}
        <ChevronDown size={16} className={`flex-none text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-gray-200 px-3 py-3">
          {stage.units.length ? (
            <div>
              <h4 className="text-xs font-semibold text-gray-500">1학년에서 배우는 때</h4>
              <ul className="mt-1 space-y-0.5 text-sm text-gray-800">
                {stage.units.map((unit) => (
                  <li key={unit.term + unit.name}><span className="font-semibold text-blue-800">{unit.term}</span> {unit.name}{unit.note ? <span className="text-xs text-gray-500"> — {unit.note}</span> : null}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {stage.beyondGrade1 ? <p className="text-xs text-gray-600"><span className="font-semibold">2학년에서 배우는 것 </span>{stage.beyondGrade1}</p> : null}
          {stage.standards.length ? (
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer font-semibold text-gray-500">교육과정 성취기준 {stage.standards.length}</summary>
              <ul className="mt-1 space-y-1">
                {stage.standards.map((standard) => <li key={standard.code}>[{standard.code}] {standard.text}</li>)}
              </ul>
            </details>
          ) : null}
          <div>
            <h4 className="text-xs font-semibold text-gray-500">이 단계에 도움이 되는 것</h4>
            {items.length ? (
              <ul className="mt-1.5 space-y-2">{items.map((item) => <ItemCard key={item.key} item={item} />)}</ul>
            ) : (
              <p className="mt-1 text-sm text-gray-500">근거를 갖춘 콘텐츠를 고르는 중입니다.</p>
            )}
          </div>
        </div>
      ) : null}
    </li>
  )
}

/**
 * `/grade1` — what grade 1 teaches and when, by the textbook, with content per
 * stage. It says when school teaches each thing, not what a child must master
 * before entry (principles 2절).
 */
export default function Grade1PreviewPage() {
  const [subjectId, setSubjectId] = useState(SUBJECTS[0].id)
  const subject = SUBJECTS.find((entry) => entry.id === subjectId) ?? SUBJECTS[0]
  const [levels, setLevels] = useState<Record<string, number>>(readLevels)
  const level = levels[subject.id]
  const startStage = level != null ? subject.levels[level]?.startStage : null
  const [openStage, setOpenStage] = useState<string | null>(startStage ?? null)

  useEffect(() => {
    setOpenStage(startStage ?? null)
  }, [subject.id, startStage])

  useEffect(() => {
    track('view_grade1', { subject: subject.id })
  }, [subject.id])

  const chooseLevel = (index: number) => {
    const next = { ...levels, [subject.id]: index }
    setLevels(next)
    writeLevels(next)
    track('select_grade1_level', { subject: subject.id, level: index + 1 })
  }

  return (
    <section className="app-destination app-page content-page" aria-labelledby="grade1-title">
      <div className="content-page__inner">
        <h1 id="grade1-title">1학년 미리보기</h1>
        <p className="content-page__lead">
          1학년 교과서가 무엇을 언제 가르치는지 보여드려요. 입학 전에 모두 해 두어야 한다는 뜻이 아닙니다.
          아이의 지금 수준에 맞는 단계를 먼저 펼쳐 드려요.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-md bg-gray-100 p-1" role="tablist" aria-label="과목">
          {SUBJECTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === subject.id}
              onClick={() => setSubjectId(entry.id)}
              className={`rounded px-2 py-2 text-sm font-semibold ${entry.id === subject.id ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-600'}`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <p className={`mt-3 rounded-md px-3 py-2.5 text-sm ${subject.outsideSchool ? 'bg-gray-100 text-gray-700' : 'bg-blue-50 text-blue-900'}`}>{subject.schoolNote}</p>

        <div className="mt-4">
          <h2 className="text-sm font-semibold text-gray-950">우리 아이는 지금</h2>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${subject.label} 지금 수준`}>
            {subject.levels.map((entry, index) => (
              <button
                key={entry.label}
                type="button"
                onClick={() => chooseLevel(index)}
                aria-pressed={level === index}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${level === index ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-gray-500">점수나 평가가 아니라 시작할 단계를 고르는 데만 씁니다. 이 기기에만 저장됩니다.</p>
        </div>

        <ol className="mt-4 space-y-2" data-testid="grade1-stages">
          {subject.stages.map((stage) => (
            <StageSection
              key={stage.id}
              stage={stage}
              open={openStage === stage.id}
              outsideSchool={subject.outsideSchool}
              onToggle={() => setOpenStage((current) => (current === stage.id ? null : stage.id))}
            />
          ))}
        </ol>

        <footer className="mt-6 space-y-1 text-[11px] leading-4 text-gray-500">
          <p>{LEARNING_AUDIENCE} 기준 · 확인일 {LEARNING_VERIFIED_AT}. 단원명은 교육청 자료(국정 교과서 현장검토본 기준)이며 배포 교과서와 일부 다를 수 있습니다.</p>
          <p>추천 콘텐츠는 광고나 협찬이 아닙니다. 사용 후기는 제휴·협찬 표기가 확인되지 않은 글만 근거로 씁니다.</p>
          <ul>
            {sourcesOf(subject).map((source) => (
              <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.label}</a></li>
            ))}
          </ul>
        </footer>
      </div>
    </section>
  )
}
