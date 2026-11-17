/**
 * 학교 주변 기관 순서(docs/operations/ACADEMY_SIGNALS_PLAN.md 5절, 2026-10-31·11-01 사용자 확정).
 *
 * 신호마다 단계를 두고 같은 단계 안에서는 가까운 순이다. 점수를 합치지 않는다 — 합치면 왜 위에 있는지
 * 부모에게 설명할 수 없다. 여러 신호가 있으면 높은 단계에 두고 배지는 모두 보인다.
 *
 * 1단계(공개자료)에서 채워지는 단계만 여기 있다. 1순위(셔틀이 이 학교를 운행함)와 2순위(1학년 반 확인)는
 * 운영자 입력(2단계)부터 들어오고, 돌봄센터(2순위)는 돌봄 탭이 따로 보인다.
 *
 *   3 초등 과정 등록   levels에 elem(NEIS 교습과정이 '초등'을 적음)
 *   4 통학차량 등록    shuttle_registered(학교안전지원시스템 등록현황, 운행 학교는 모름)
 *   5 예능·체육         학년 표기 없이 예능·체육 분야이거나 체육도장·체육교습업
 *   6 그 밖
 *   7 중·고 과정만      levels에 secondary가 있고 elem이 없음
 */

export type ProviderBadge = 'elementary' | 'shuttle' | 'secondary'

export interface RankableInstitution {
  name: string
  type: string
  key?: string
  levels?: string[]
  shuttle_registered?: boolean
}

export interface RankableAddress<I extends RankableInstitution = RankableInstitution> {
  address_id: string
  straight_distance_m: number
  institutions: I[]
}

export interface RankedProvider<I extends RankableInstitution = RankableInstitution> {
  institution: I
  addressId: string
  distance: number
  rank: number
  badges: ProviderBadge[]
  categories: string[]
}

const ACTIVITY_CATEGORIES = new Set(['arts', 'sports'])
const SPORTS_TYPES = new Set(['체육도장업', '체육교습업'])

export const providerBadges = (institution: RankableInstitution): ProviderBadge[] => {
  const levels = institution.levels ?? []
  const badges: ProviderBadge[] = []
  if (levels.includes('elem')) badges.push('elementary')
  if (institution.shuttle_registered) badges.push('shuttle')
  if (levels.includes('secondary') && !levels.includes('elem')) badges.push('secondary')
  return badges
}

export const providerRank = (institution: RankableInstitution, categories: string[]): number => {
  const badges = providerBadges(institution)
  if (badges.includes('elementary')) return 3
  if (badges.includes('shuttle')) return 4
  if (badges.includes('secondary')) return 7
  if (SPORTS_TYPES.has(institution.type) || categories.some((key) => ACTIVITY_CATEGORIES.has(key))) return 5
  return 6
}

/**
 * 주소 목록을 기관 하나씩 펼쳐 순서대로 놓는다. 같은 기관이 두 주소에 걸리면(같은 키) 가까운 쪽 하나만 남긴다.
 * categoriesOf는 화면의 분야 분류(academyCategories.getInstitutionCategories)를 받는다.
 */
export const rankProviders = <I extends RankableInstitution>(
  addresses: RankableAddress<I>[],
  categoriesOf: (institution: I) => string[],
): RankedProvider<I>[] => {
  const byIdentity = new Map<string, RankedProvider<I>>()
  addresses.forEach((address) => {
    address.institutions.forEach((institution) => {
      if (!institution.name?.trim()) return
      const identity = institution.key || `${address.address_id}|${institution.name}|${institution.type}`
      const distance = Number.isFinite(address.straight_distance_m) ? address.straight_distance_m : Infinity
      const previous = byIdentity.get(identity)
      if (previous && previous.distance <= distance) return
      const categories = categoriesOf(institution)
      byIdentity.set(identity, {
        institution, addressId: address.address_id, distance,
        rank: providerRank(institution, categories), badges: providerBadges(institution), categories,
      })
    })
  })
  return [...byIdentity.values()].sort((a, b) => a.rank - b.rank || a.distance - b.distance
    || a.institution.name.localeCompare(b.institution.name, 'ko'))
}
