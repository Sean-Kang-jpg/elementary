import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  CURRICULUM_PATHS,
  ageBandLabel,
  costLabel,
  domainLabel,
  findItem,
  itemPath,
  planItemTarget,
  planTarget,
  regionLabel,
  typeLabel,
  type CurriculumPlan,
} from '../../content/curriculum'
import { followLink } from '../content/contentLinks'
import LikeButton from './LikeButton'
import { useLikes } from './useLikes'

interface Props {
  plan: CurriculumPlan
  onNavigate: (path: string) => void
}

/**
 * A card: its modules and the items in each, with a like per item (the vote that
 * feeds the ranking) and one for the card itself.
 */
export default function PlanPage({ plan, onNavigate }: Props) {
  const keys = useMemo(() => [
    planTarget(plan.key),
    ...plan.modules.flatMap((module) => module.items.map((entry) => planItemTarget(plan.key, entry.item))),
  ], [plan])
  const likes = useLikes(keys)
  const context = { plan_key: plan.key, age_band: plan.ageBand, region: plan.region ?? 'all' }

  return (
    <section className="app-destination app-page content-page" aria-labelledby="plan-title">
      <div className="content-page__inner">
        <a href={CURRICULUM_PATHS.plans} onClick={(event) => followLink(event, CURRICULUM_PATHS.plans, onNavigate)} className="inline-flex items-center gap-1 py-1 text-sm font-medium text-blue-700">
          <ArrowLeft size={16} aria-hidden="true" />우리 아이 커리큘럼
        </a>
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-500">
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">에디터</span>
          {ageBandLabel(plan.ageBand)} · {regionLabel(plan.region)}
          {plan.weeklyHours ? ` · 주 ${plan.weeklyHours}시간` : ''}
          {plan.monthlyCost ? ` · ${costLabel(plan.monthlyCost)}` : ''}
        </p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 id="plan-title">{plan.title}</h1>
          <LikeButton
            size="large"
            label="이 카드"
            liked={likes.mine.has(planTarget(plan.key))}
            count={likes.counts[planTarget(plan.key)] ?? 0}
            onClick={() => likes.toggle(planTarget(plan.key), { name: 'like_plan', params: context })}
          />
        </div>
        <p className="content-page__lead">{plan.summary}</p>
        {likes.error ? <p className="mt-2 text-sm text-rose-700" role="alert">{likes.error}</p> : null}

        {plan.modules.map((module) => (
          <section key={module.domain} className="mt-5" aria-label={domainLabel(module.domain)}>
            <h2 className="text-base font-semibold text-gray-950">{domainLabel(module.domain)}</h2>
            {module.note ? <p className="mt-0.5 text-sm text-gray-600">{module.note}</p> : null}
            <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {module.items.map((entry) => {
                const item = findItem(entry.item)
                if (!item) return null
                const target = planItemTarget(plan.key, item.key)
                return (
                  <li key={item.key} className="flex items-start gap-3 px-3 py-3" data-testid="plan-item">
                    <a href={itemPath(item)} onClick={(event) => followLink(event, itemPath(item), onNavigate)} className="min-w-0 flex-1">
                      <strong className="block text-sm text-gray-950">{item.name}</strong>
                      <span className="text-xs text-gray-500">{typeLabel(item.type)}{entry.monthsUsed ? ` · ${entry.monthsUsed}개월째` : ''}</span>
                      {entry.note ? <span className="mt-1 block text-sm text-gray-700">{entry.note}</span> : null}
                    </a>
                    <LikeButton
                      label={item.name}
                      liked={likes.mine.has(target)}
                      count={likes.counts[target] ?? 0}
                      onClick={() => likes.toggle(target, { name: 'like_item', params: { ...context, item_key: item.key, domain: module.domain } })}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        <p className="mt-6 text-xs leading-5 text-gray-500">
          에디터 카드는 어디초가 공개 정보로 구성한 예시입니다. 광고나 협찬이 아니며, 따봉 수는 누른 사람 수입니다.
        </p>
      </div>
    </section>
  )
}
