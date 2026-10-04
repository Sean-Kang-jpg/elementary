import { useMemo } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import {
  CURRICULUM_PATHS,
  ageBandLabel,
  domainLabel,
  itemTarget,
  planPath,
  plansWithItem,
  regionLabel,
  typeLabel,
  type CurriculumItem,
} from '../../content/curriculum'
import { followLink } from '../content/contentLinks'
import LikeButton from './LikeButton'
import { useLikes } from './useLikes'

interface Props {
  item: CurriculumItem
  onNavigate: (path: string) => void
}

const ageRange = (item: CurriculumItem) => {
  if (item.ageMin == null && item.ageMax == null) return null
  if (item.ageMin != null && item.ageMax != null) return `${item.ageMin}~${item.ageMax}세`
  return item.ageMin != null ? `${item.ageMin}세부터` : `${item.ageMax}세까지`
}

/**
 * One item: what it is, where it comes from, and the cards that use it. A like
 * here has no card, so it counts only in the nationwide, all-ages ranking.
 */
export default function ItemPage({ item, onNavigate }: Props) {
  const plans = useMemo(() => plansWithItem(item.key), [item.key])
  const likes = useLikes(useMemo(() => [itemTarget(item.key)], [item.key]))
  const range = ageRange(item)

  return (
    <section className="app-destination app-page content-page" aria-labelledby="item-title">
      <div className="content-page__inner">
        <a href={CURRICULUM_PATHS.ranking} onClick={(event) => followLink(event, CURRICULUM_PATHS.ranking, onNavigate)} className="inline-flex items-center gap-1 py-1 text-sm font-medium text-blue-700">
          <ArrowLeft size={16} aria-hidden="true" />아이템 순위
        </a>
        <p className="mt-3 text-xs font-semibold text-gray-500">
          {typeLabel(item.type)} · {item.domains.map(domainLabel).join(' · ')}{range ? ` · ${range}` : ''}
        </p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 id="item-title">{item.name}</h1>
          <LikeButton
            size="large"
            label={item.name}
            liked={likes.mine.has(itemTarget(item.key))}
            count={likes.counts[itemTarget(item.key)] ?? 0}
            onClick={() => likes.toggle(itemTarget(item.key), { name: 'like_item', params: { item_key: item.key, plan_key: 'none' } })}
          />
        </div>
        {item.aliases?.length ? <p className="text-sm text-gray-500">다른 이름: {item.aliases.join(', ')}</p> : null}
        {item.description ? <p className="content-page__lead">{item.description}</p> : null}
        {likes.error ? <p className="mt-2 text-sm text-rose-700" role="alert">{likes.error}</p> : null}
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700">
          공식 페이지 <ExternalLink size={14} aria-hidden="true" />
        </a>

        <h2 className="mt-6 text-base font-semibold text-gray-950">이 아이템이 든 카드 {plans.length}</h2>
        <ul className="mt-2 space-y-2">
          {plans.map((plan) => (
            <li key={plan.key}>
              <a href={planPath(plan)} onClick={(event) => followLink(event, planPath(plan), onNavigate)} className="block rounded-lg border border-gray-200 bg-white px-3 py-2.5 hover:border-blue-300">
                <strong className="block text-sm text-gray-950">{plan.title}</strong>
                <span className="text-xs text-gray-500">{ageBandLabel(plan.ageBand)} · {regionLabel(plan.region)}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs leading-5 text-gray-500">정보 확인일 {item.verifiedAt}. 연령·가격 등은 공식 페이지를 기준으로 확인하세요.</p>
      </div>
    </section>
  )
}
