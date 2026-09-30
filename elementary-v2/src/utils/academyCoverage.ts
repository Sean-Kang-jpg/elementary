const ACADEMY_DATA_REGIONS = new Set([
  '서울특별시',
  '경기도',
  '인천광역시',
  '부산광역시',
  '대구광역시',
  '대전광역시',
  '광주광역시',
  '울산광역시',
  '세종특별자치시',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
])

export const hasAcademyData = (region?: string | null): boolean =>
  Boolean(region && ACADEMY_DATA_REGIONS.has(region))

export const ACADEMY_DATA_PENDING_LABEL = '교육시설 데이터 준비 중'
