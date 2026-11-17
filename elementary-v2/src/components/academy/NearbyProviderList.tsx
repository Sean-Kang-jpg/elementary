import { CalendarPlus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AcademyAddress } from '../../types'
import { getAcademyCategory, getInstitutionCategories } from '../../utils/academyCategories'
import { rankProviders, type ProviderBadge } from '../../utils/providerRanking'
import { useAppContext } from '../../contexts/AppContext'
import { track } from '../../utils/analytics'
import AcademyTimetableForm from '../map/AcademyTimetableForm'
import { followLink } from '../content/contentLinks'

/**
 * 학교 주변 기관 목록(ACADEMY_SIGNALS_PLAN.md 7절 S1). 순서는 utils/providerRanking.ts(5절 규칙)이고,
 * 위의 분야 분포에서 고른 분야(state.activityCategory)로 좁혀진다. 배움·돌봄 탭도 같은 목록을 쓸 수 있다.
 */

const BADGES: Record<ProviderBadge, { label: string; title: string; className: string }> = {
  elementary: {
    label: '초등 과정 등록',
    title: '공개자료(NEIS 학원·교습소 정보)의 교습과정에 초등이 적혀 있어요. 1학년 반이 있는지는 기관에 확인하세요.',
    className: 'border-teal-300 bg-teal-50 text-teal-800',
  },
  shuttle: {
    label: '통학차량 등록',
    title: '공개자료(학교안전지원시스템 통학버스 등록현황)에 있는 기관이에요. 어느 학교를 도는지는 기관에 확인하세요.',
    className: 'border-gray-300 bg-white text-gray-700',
  },
  secondary: {
    label: '중·고 과정',
    title: '공개자료의 교습과정에 중·고등 과정만 적혀 있어요.',
    className: 'border-gray-200 bg-gray-50 text-gray-500',
  },
}

const PAGE = 15

interface NearbyProviderListProps {
  academies: AcademyAddress[]
  schoolId: string
  onNavigate: (path: string) => void
}

export default function NearbyProviderList({ academies, schoolId, onNavigate }: NearbyProviderListProps) {
  const { state, dispatch } = useAppContext()
  const category = state.activityCategory
  const [shown, setShown] = useState(PAGE)
  const [adding, setAdding] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; message: string; path?: string } | null>(null)
  const ranked = useMemo(
    () => rankProviders(academies, (institution) => getInstitutionCategories(institution).map(({ key }) => key)),
    [academies],
  )
  const rows = useMemo(() => (category ? ranked.filter((row) => row.categories.includes(category)) : ranked), [ranked, category])
  const viewed = useRef<string | null>(null)

  useEffect(() => { setShown(PAGE) }, [category, schoolId])
  useEffect(() => {
    if (!ranked.length || viewed.current === schoolId) return
    viewed.current = schoolId
    track('view_nearby_providers', {
      school_id: schoolId, providers: ranked.length,
      elementary: ranked.filter((row) => row.badges.includes('elementary')).length,
      shuttle: ranked.filter((row) => row.badges.includes('shuttle')).length,
    })
  }, [ranked, schoolId])

  if (!ranked.length) return null
  const id = (row: (typeof rows)[number]) => row.institution.key || `${row.addressId}|${row.institution.name}`

  return (
    <section aria-labelledby="nearby-providers-title" className="space-y-2" data-testid="nearby-provider-list">
      <h3 id="nearby-providers-title" className="font-semibold text-gray-950">주변 기관 <span className="text-xs font-normal text-gray-500">· {rows.length.toLocaleString()}곳</span></h3>
      <p className="text-[11px] leading-4 text-gray-500">
        초등 과정 등록, 통학차량 등록 순으로 먼저 보이고 같은 단계 안에서는 가까운 곳부터예요. 두 표시는 공개자료에서 확인한 것이라
        1학년 반이 있는지, 우리 학교로 셔틀이 오는지는 기관에 확인하세요.
      </p>
      {category && (
        <p className="text-xs text-gray-600">분야: <strong>{getAcademyCategory(category).label}</strong>{' '}
          <button type="button" className="text-blue-700 underline" onClick={() => {
            dispatch({ type: 'SET_ACTIVITY_CATEGORY', payload: null })
            window.dispatchEvent(new CustomEvent('joinmap:filter-academies', { detail: { category: null } }))
          }}>전체 보기</button>
        </p>
      )}
      <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
        {rows.slice(0, shown).map((row, index) => {
          const rowId = id(row)
          const categories = getInstitutionCategories(row.institution)
          return (
            <li key={rowId} className="space-y-1 px-3 py-2.5" data-rank={row.rank}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm text-gray-900">{row.institution.name}</strong>
                  <small className="text-gray-500">{[row.institution.type, Number.isFinite(row.distance) ? `${Math.round(row.distance).toLocaleString()}m` : ''].filter(Boolean).join(' · ')}</small>
                </div>
                <button type="button" className="map-academy-icon" aria-expanded={adding === rowId}
                  aria-label={`${row.institution.name} 내 시간표에 추가`} title="내 시간표에 추가"
                  onClick={() => {
                    setDone(null)
                    const opening = adding !== rowId
                    setAdding(opening ? rowId : null)
                    if (opening) track('click_provider', { school_id: schoolId, position: index + 1, rank: row.rank, badges: row.badges.join(',') || 'none' })
                  }}>
                  <CalendarPlus size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {row.badges.map((badge) => (
                  <span key={badge} title={BADGES[badge].title} className={`rounded-full border px-2 py-0.5 text-xs ${BADGES[badge].className}`}>{BADGES[badge].label}</span>
                ))}
                {categories.map((item) => (
                  <span key={item.key} className="rounded-full px-2 py-0.5 text-xs" style={{ color: item.color, backgroundColor: item.softColor }}>{item.label}</span>
                ))}
              </div>
              {adding === rowId && (
                <AcademyTimetableForm label={`${categories[0]?.label ?? '학원'} · ${row.institution.name}`}
                  providerKey={row.institution.key} onNavigate={onNavigate}
                  onDone={(message, path) => {
                    setAdding(null)
                    setDone({ id: rowId, message, path })
                    track('add_provider_to_timetable', { school_id: schoolId, position: index + 1, rank: row.rank, badges: row.badges.join(',') || 'none' })
                  }} />
              )}
              {done?.id === rowId && <p className="map-academy-form__done" role="status">{done.message}
                {done.path && <> <a href={done.path} onClick={(event) => followLink(event, done.path!, onNavigate)}>우리집 일정에서 보기·빼기</a></>}</p>}
            </li>
          )
        })}
      </ul>
      {rows.length > shown && (
        <button type="button" className="w-full rounded-md border border-gray-200 py-2 text-sm text-gray-700" onClick={() => setShown(shown + PAGE)}>
          더 보기 ({Math.min(PAGE, rows.length - shown)}곳)
        </button>
      )}
    </section>
  )
}
