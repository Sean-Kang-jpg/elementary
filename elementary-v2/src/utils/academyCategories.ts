import type { AcademyAddress } from '../types'

export type AcademyCategoryKey = 'study' | 'arts' | 'language' | 'sports' | 'other'

export interface AcademyCategoryDefinition {
  key: AcademyCategoryKey
  label: string
  shortLabel: string
  color: string
  softColor: string
  keywords: string[]
}

export const ACADEMY_CATEGORIES: AcademyCategoryDefinition[] = [
  { key: 'study', label: '입시·보습', shortLabel: '입', color: '#2563eb', softColor: '#dbeafe', keywords: ['입시', '보습', '종합', '교과', '독서'] },
  { key: 'arts', label: '예능', shortLabel: '예', color: '#db2777', softColor: '#fce7f3', keywords: ['예능', '음악', '미술', '무용', '연기'] },
  { key: 'language', label: '외국어', shortLabel: '외', color: '#7c3aed', softColor: '#ede9fe', keywords: ['국제화', '외국어', '영어', '중국어', '일본어', '어학'] },
  { key: 'sports', label: '체육', shortLabel: '체', color: '#059669', softColor: '#d1fae5', keywords: ['체육', '무도', '태권도', '검도', '유도', '합기도', '복싱', '권투', '우슈', '레슬링', '수영', '스포츠'] },
  { key: 'other', label: '기타', shortLabel: '기', color: '#64748b', softColor: '#f1f5f9', keywords: [] },
]

export const getAcademyCategory = (key: AcademyCategoryKey) => (
  ACADEMY_CATEGORIES.find((category) => category.key === key) || ACADEMY_CATEGORIES[4]
)

export const normalizeAcademyRealm = (name: string): AcademyCategoryKey => {
  const category = ACADEMY_CATEGORIES.find((item) => (
    item.key !== 'other' && item.keywords.some((keyword) => name.includes(keyword))
  ))
  return category?.key || 'other'
}

export const getAcademyCategoryCounts = (academy: AcademyAddress) => {
  const counts = Object.fromEntries(ACADEMY_CATEGORIES.map(({ key }) => [key, 0])) as Record<AcademyCategoryKey, number>
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
