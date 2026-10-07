import type { School } from '../types'

/**
 * 인근 학교 비교의 계산. 프리렌더(api/detail.js)의 `pooledPerClass`·`nearbySummary`와
 * 같은 규칙이다 — 검색엔진이 읽는 문장과 화면의 문장이 달라지면 안 된다.
 */

export interface NearbySchool {
  school: School
  distanceKm: number
}

export const distanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number => {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLng = (b.longitude - a.longitude) * rad
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/** 평균이 아니라 합계의 비. 두 학급짜리 학교가 열 학급짜리 학교와 같은 무게를 가지면 안 된다. */
export const pooledPerClass = (schools: School[]): number | null => {
  const students = schools.reduce((sum, school) => sum + (school.grade1_students || 0), 0)
  const classes = schools.reduce((sum, school) => sum + (school.grade1_classes || 0), 0)
  return classes ? Math.round((students / classes) * 10) / 10 : null
}

export const nearbySummary = (school: School, nearby: School[]): string | null => {
  const own = school.grade1_per_class || null
  const theirs = pooledPerClass(nearby)
  if (own == null || theirs == null || !nearby.length) return null
  const diff = Math.round((own - theirs) * 10) / 10
  const head = `1학년 학급당 학생 수는 ${own}명으로, 가까운 학교 ${nearby.length}곳 평균 ${theirs}명`
  if (Math.abs(diff) < 0.5) return `${head}과 비슷합니다.`
  return diff > 0 ? `${head}보다 ${diff}명 많습니다.` : `${head}보다 ${-diff}명 적습니다.`
}
