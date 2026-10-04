import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import {
  AGE_BANDS,
  CURRICULUM_PATHS,
  DOMAINS,
  PLANS,
  SAMPLE_THRESHOLD,
  domainLabel,
  findItem,
  itemPath,
  regionLabel,
  typeLabel,
} from '../../content/curriculum'
import { getItemRanking, type RankingRow } from '../../services/curriculumService'
import { followLink } from '../content/contentLinks'

interface Props {
  onNavigate: (path: string) => void
}

type Option = { id: string | null; label: string }

const Chips = ({ label, options, value, onChange }: { label: string; options: Option[]; value: string | null; onChange: (id: string | null) => void }) => (
  <div className="mt-3">
    <span className="mb-1.5 block text-xs font-semibold text-gray-500">{label}</span>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id ?? 'all'}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={`h-8 rounded-full border px-3 text-xs font-semibold ${value === option.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
)

/**
 * Item ranking for one age × region × domain cell. A cell with fewer distinct
 * voters than the threshold shows no order (PRD 3절): a ranking of five votes
 * reads as a fact and is not one.
 */
export default function RankingPage({ onNavigate }: Props) {
  const [ageBand, setAgeBand] = useState<string | null>(null)
  const [region, setRegion] = useState<string | null>(null)
  const [domain, setDomain] = useState<string | null>(null)
  const [recent, setRecent] = useState(false)
  const [rows, setRows] = useState<RankingRow[] | null | undefined>(undefined)
  // Only regions some card belongs to can have a cell.
  const regions = useMemo(() => [...new Set(PLANS.map((plan) => plan.region).filter((value): value is string => Boolean(value)))], [])

  useEffect(() => {
    let active = true
    setRows(undefined)
    getItemRanking({ ageBand, region, domain, days: recent ? 90 : null })
      .then((result) => { if (active) setRows(result) })
      .catch((reason) => {
        console.error('아이템 순위 조회 실패:', reason)
        if (active) setRows(null)
      })
    return () => { active = false }
  }, [ageBand, region, domain, recent])

  const cellVoters = rows?.[0]?.cell_voters ?? 0
  const enough = cellVoters >= SAMPLE_THRESHOLD

  return (
    <section className="app-destination app-page content-page" aria-labelledby="ranking-title">
      <div className="content-page__inner">
        <a href={CURRICULUM_PATHS.plans} onClick={(event) => followLink(event, CURRICULUM_PATHS.plans, onNavigate)} className="inline-flex items-center gap-1 py-1 text-sm font-medium text-blue-700">
          <ArrowLeft size={16} aria-hidden="true" />우리 아이 커리큘럼
        </a>
        <h1 id="ranking-title" className="mt-2">아이템 순위</h1>
        <p className="content-page__lead">카드 안에서 따봉을 받은 아이템을, 따봉을 누른 사람 수로 셉니다. 한 사람이 같은 아이템을 여러 카드에서 눌러도 한 번입니다.</p>

        <Chips label="연령" options={[{ id: null, label: '전체' }, ...AGE_BANDS]} value={ageBand} onChange={setAgeBand} />
        {regions.length ? <Chips label="지역" options={[{ id: null, label: '전국' }, ...regions.map((id) => ({ id, label: regionLabel(id) }))]} value={region} onChange={setRegion} /> : null}
        <Chips label="영역" options={[{ id: null, label: '전체' }, ...DOMAINS]} value={domain} onChange={setDomain} />
        <Chips label="기간" options={[{ id: null, label: '전체 기간' }, { id: '90', label: '최근 90일' }]} value={recent ? '90' : null} onChange={(id) => setRecent(id === '90')} />

        <div className="mt-5" data-testid="ranking">
          {rows === undefined ? (
            <LoaderCircle className="animate-spin text-blue-600" size={20} aria-label="순위 불러오는 중" />
          ) : rows === null ? (
            <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">순위를 불러오지 못했습니다.</p>
          ) : !enough ? (
            <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
              아직 표본이 적어 순위를 공개하지 않습니다.<br />
              이 조건에서 따봉을 누른 사람 {cellVoters.toLocaleString()}명 · {SAMPLE_THRESHOLD}명부터 공개
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-gray-500">따봉을 누른 사람 {cellVoters.toLocaleString()}명 기준{recent ? ' · 최근 90일' : ''}</p>
              <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                {rows.map((row, index) => {
                  const item = findItem(row.item_key)
                  if (!item) return null
                  return (
                    <li key={row.item_key}>
                      <a href={itemPath(item)} onClick={(event) => followLink(event, itemPath(item), onNavigate)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                        <strong className="w-6 text-center text-sm text-blue-700">{index + 1}</strong>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm text-gray-950">{item.name}</strong>
                          <span className="text-xs text-gray-500">{typeLabel(item.type)} · {item.domains.map(domainLabel).join(' · ')}</span>
                        </span>
                        <span className="text-xs font-semibold text-gray-600">{row.voters.toLocaleString()}명</span>
                      </a>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
