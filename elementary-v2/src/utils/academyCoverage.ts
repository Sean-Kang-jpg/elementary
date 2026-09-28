const ACADEMY_DATA_REGIONS = new Set([
  '서울특별시',
  '경기도',
  '인천광역시',
])

export const hasAcademyData = (region?: string | null): boolean =>
  Boolean(region && ACADEMY_DATA_REGIONS.has(region))

export const ACADEMY_DATA_PENDING_LABEL = '학원 데이터 준비 중'
