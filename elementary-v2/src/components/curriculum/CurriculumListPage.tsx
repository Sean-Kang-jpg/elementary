import { useMemo, useState } from 'react'
import { ChevronRight, Trophy } from 'lucide-react'
import {
  AGE_BANDS,
  CURRICULUM_PATHS,
  PLANS,
  ageBandLabel,
  domainLabel,
  planPath,
  planTarget,
  regionLabel,
} from '../../content/curriculum'
import { followLink } from '../content/contentLinks'
import { useLikes } from './useLikes'

interface Props {
  onNavigate: (path: string) => void
}

/** `/plans` — editor cards by child age, with each card's like count. */
export default function CurriculumListPage({ onNavigate }: Props) {
  const [ageBand, setAgeBand] = useState<string | null>(null)
  const plans = useMemo(
    () => PLANS
      .filter((plan) => !ageBand || plan.ageBand === ageBand)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    [ageBand],
  )
  const likes = useLikes(useMemo(() => PLANS.map((plan) => planTarget(plan.key)), []))

  return (
    <section className="app-destination app-page content-page" aria-labelledby="curriculum-title">
      <div className="content-page__inner">
        <h1 id="curriculum-title">우리 아이 커리큘럼</h1>
        <p className="content-page__lead">또래 아이들이 실제로 보고 읽고 노는 것을 연령별 카드로 모았어요. 카드 안의 아이템마다 따봉을 눌러 주세요.</p>

        <a href={CURRICULUM_PATHS.ranking} onClick={(event) => followLink(event, CURRICULUM_PATHS.ranking, onNavigate)} className="content-list__item content-list__item--card">
          <span className="home-link__icon home-link__icon--sage"><Trophy size={19} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <strong>아이템 순위</strong>
            <small>연령·지역·영역별로 따봉을 가장 많이 받은 아이템</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="아이 연령">
          {[{ id: null, label: '전체' }, ...AGE_BANDS].map((band) => (
            <button
              key={band.id ?? 'all'}
              type="button"
              onClick={() => setAgeBand(band.id)}
              aria-pressed={ageBand === band.id}
              className={`h-9 rounded-full border px-3.5 text-sm font-semibold ${ageBand === band.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {band.label}
            </button>
          ))}
        </div>

        {plans.length === 0 ? (
          <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">이 연령의 카드는 아직 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-3" data-testid="plan-list">
            {plans.map((plan) => {
              const itemCount = plan.modules.reduce((sum, module) => sum + module.items.length, 0)
              return (
                <li key={plan.key}>
                  <a href={planPath(plan)} onClick={(event) => followLink(event, planPath(plan), onNavigate)} className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300">
                    <span className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">에디터</span>
                      {ageBandLabel(plan.ageBand)} · {regionLabel(plan.region)}
                    </span>
                    <strong className="mt-1.5 block text-base text-gray-950">{plan.title}</strong>
                    <span className="mt-1 block text-sm text-gray-600">{plan.summary}</span>
                    <span className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <span>{plan.modules.map((module) => domainLabel(module.domain)).join(' · ')} · 아이템 {itemCount}개</span>
                      <span className="font-semibold text-blue-700">따봉 {(likes.counts[planTarget(plan.key)] ?? 0).toLocaleString()}</span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
