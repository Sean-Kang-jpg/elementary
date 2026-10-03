import type { AcademyAddress } from '../types'

/**
 * Academy categories on the map and in the education panel.
 *
 * Each published institution carries `subjects`, derived from its name by the ETL
 * (etl/academy_subjects.py, backfilled into academy_address_serving). NEIS files
 * most academies under one realm, '입시.검정 및 보습', so the realm alone painted the
 * map one colour; the name says 영어, 수학, 논술. The keys here must match the
 * ETL's.
 *
 * An institution can have several subjects (영수전문 → 영어 and 수학), so category
 * counts can add up to more than the number of institutions.
 *
 * Rows published before the backfill have no `subjects`; they fall back to the
 * realm, as the map did before.
 */
export type AcademyCategoryKey =
  | 'english' | 'math' | 'writing' | 'science' | 'coding'
  | 'study' | 'language' | 'arts' | 'sports' | 'other'

export interface AcademyCategoryDefinition {
  key: AcademyCategoryKey
  label: string
  shortLabel: string
  color: string
  softColor: string
  /** Realm keywords for rows without subjects. Empty for name-only categories. */
  realmKeywords: string[]
}

export const ACADEMY_CATEGORIES: AcademyCategoryDefinition[] = [
  { key: 'english', label: '영어', shortLabel: '영', color: '#7c3aed', softColor: '#ede9fe', realmKeywords: [] },
  { key: 'math', label: '수학', shortLabel: '수', color: '#2563eb', softColor: '#dbeafe', realmKeywords: [] },
  { key: 'writing', label: '국어·논술', shortLabel: '논', color: '#ea580c', softColor: '#ffedd5', realmKeywords: [] },
  { key: 'science', label: '과학', shortLabel: '과', color: '#0891b2', softColor: '#cffafe', realmKeywords: [] },
  { key: 'coding', label: '코딩', shortLabel: '코', color: '#ca8a04', softColor: '#fef9c3', realmKeywords: ['정보'] },
  { key: 'study', label: '입시·종합', shortLabel: '입', color: '#1e3a8a', softColor: '#e0e7ff', realmKeywords: ['입시', '보습', '종합', '교과', '독서', '인문사회'] },
  { key: 'language', label: '외국어', shortLabel: '외', color: '#a855f7', softColor: '#f3e8ff', realmKeywords: ['국제화', '외국어', '영어', '중국어', '일본어', '어학'] },
  { key: 'arts', label: '예능', shortLabel: '예', color: '#db2777', softColor: '#fce7f3', realmKeywords: ['예능', '음악', '미술', '무용', '연기'] },
  { key: 'sports', label: '체육', shortLabel: '체', color: '#059669', softColor: '#d1fae5', realmKeywords: ['체육', '무도', '태권도', '검도', '유도', '합기도', '복싱', '권투', '우슈', '레슬링', '수영', '스포츠'] },
  { key: 'other', label: '기타', shortLabel: '기', color: '#94a3b8', softColor: '#f1f5f9', realmKeywords: [] },
]

const KEYS = new Set<AcademyCategoryKey>(ACADEMY_CATEGORIES.map(({ key }) => key))
const OTHER = ACADEMY_CATEGORIES.find((category) => category.key === 'other')!

export const getAcademyCategory = (key: AcademyCategoryKey) => (
  ACADEMY_CATEGORIES.find((category) => category.key === key) || OTHER
)

/** The realm-only fallback, for rows published before subjects existed. */
export const normalizeAcademyRealm = (name: string): AcademyCategoryKey => {
  const category = ACADEMY_CATEGORIES.find((item) => item.realmKeywords.some((keyword) => name.includes(keyword)))
  return category?.key || 'other'
}

const emptyCounts = () => Object.fromEntries(ACADEMY_CATEGORIES.map(({ key }) => [key, 0])) as Record<AcademyCategoryKey, number>

export const getAcademyCategoryCounts = (academy: AcademyAddress) => {
  const counts = emptyCounts()
  const institutions = academy.institutions || []
  const tagged = institutions.length > 0 && institutions.every((item) => Array.isArray(item.subjects) && item.subjects.length > 0)
  if (tagged) {
    institutions.forEach((item) => {
      item.subjects!.forEach((subject) => {
        counts[KEYS.has(subject as AcademyCategoryKey) ? subject as AcademyCategoryKey : 'other'] += 1
      })
    })
    return counts
  }
  Object.entries(academy.realm_counts || {}).forEach(([name, count]) => {
    counts[normalizeAcademyRealm(name)] += Number(count || 0)
  })
  return counts
}

export const getDominantAcademyCategory = (academy: AcademyAddress) => {
  const counts = getAcademyCategoryCounts(academy)
  return ACADEMY_CATEGORIES.reduce((dominant, category) => (
    counts[category.key] > counts[dominant.key] ? category : dominant
  ), ACADEMY_CATEGORIES[0])
}

export const academyHasCategory = (academy: AcademyAddress, category: AcademyCategoryKey | null) => (
  !category || getAcademyCategoryCounts(academy)[category] > 0
)
