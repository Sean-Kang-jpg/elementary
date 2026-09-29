import type { Apartment, School } from '../types'
import { findRegion } from '../constants/regionRegistry'

/**
 * URL이 선택 상태를 비추게 한다.
 *
 * 라우터를 쓰지 않는 이유: 이 앱은 화면을 갈아끼우지 않는다. 지도 하나 위에서
 * 선택이 바뀌고 바텀시트가 열린다. 라우터는 화면 교체를 위한 도구라 이 모델과
 * 맞지 않고, 주소만 선택을 따라가면 공유와 색인에 필요한 것은 전부 충족된다.
 *
 * 주소 모양 (ADR-007):
 *
 *     /apt/서울-강남구-은마--7A2EMR5J
 *     /school/서울-강남구-서울대현초등학교--B000002292
 *
 * **마지막 `--` 뒤의 값만 권위를 가진다.** 앞부분은 읽으라고 붙인 장식이며
 * 해석하지 않는다. 아파트는 개명되므로(그래서 `apartment_name_history`가
 * 있다) 이름을 주소의 진실로 삼으면 개명될 때마다 링크가 죽는다.
 */

export type Route =
  | { kind: 'map' }
  | { kind: 'admin' }
  | { kind: 'school'; key: string }
  | { kind: 'apartment'; key: string }

/** 교육부 학교 표준데이터가 부여하는 형태. 파이프라인이 만들지 않는다. */
const SCHOOL_KEY = /^B\d+$/i
/** Crockford Base32 8자. I·L·O·U가 없어 사람이 옮겨 적어도 헷갈리지 않는다. */
const APARTMENT_KEY = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/i

const KEY_SEPARATOR = '--'

/**
 * 장식 부분을 만든다. 규칙이 단순해야 매 요청마다 같은 문자열이 나오고,
 * 달라지면 불필요한 리다이렉트가 생긴다. 주소의 중복은 무해하지만 규칙의
 * 복잡함은 버그를 만들므로, 이름에 지역이 이미 들어 있어도 그대로 둔다.
 */
const readable = (parts: Array<string | undefined>): string =>
  parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('-')
    // 경로·질의로 읽히는 문자와 공백만 덜어낸다. 한글은 그대로 둔다.
    .replace(/[\\/?#%&+\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

const shortRegion = (region?: string): string | undefined =>
  region ? findRegion(region)?.shortName ?? region : undefined

/** 주소에서 키만 떼어낸다. 장식은 무엇이 오든 무시한다. */
const keyOf = (segment: string): string => {
  const decoded = safeDecode(segment)
  const at = decoded.lastIndexOf(KEY_SEPARATOR)
  return (at === -1 ? decoded : decoded.slice(at + KEY_SEPARATOR.length)).trim()
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    // 잘린 퍼센트 인코딩으로 들어오면 원문 그대로 다룬다.
    return value
  }
}

export const parseRoute = (pathname: string, search = ''): Route => {
  if (pathname === '/admin/etl' || new URLSearchParams(search).get('view') === 'etl') {
    return { kind: 'admin' }
  }

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length !== 2) return { kind: 'map' }

  const [prefix, slug] = segments
  const key = keyOf(slug)

  if (prefix === 'school' && SCHOOL_KEY.test(key)) {
    return { kind: 'school', key: key.toUpperCase() }
  }
  if (prefix === 'apt' && APARTMENT_KEY.test(key)) {
    return { kind: 'apartment', key: key.toUpperCase() }
  }
  return { kind: 'map' }
}

export const schoolPath = (school: School): string =>
  `/school/${readable([shortRegion(school.region), school.district, school.school_name])}` +
  `${KEY_SEPARATOR}${school.school_id}`

/**
 * 키가 아직 발급되지 않은 단지는 주소를 갖지 않는다. 임시 주소를 만들어 두면
 * 나중에 진짜 키가 붙을 때 그 주소가 죽으므로, 없는 편이 낫다.
 */
export const apartmentPath = (apartment: Apartment): string | null => {
  if (!apartment.public_key) return null
  return `/apt/${readable([shortRegion(apartment.city), apartment.district, apartment.name])}` +
    `${KEY_SEPARATOR}${apartment.public_key}`
}

/** 공유되거나 색인될 때 쓰이는 절대 주소. */
export const absoluteUrl = (path: string): string =>
  typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString()

/**
 * `<link rel="canonical">`을 정규 주소로 맞춘다.
 *
 * 장식 부분이 자유롭다는 것은 같은 페이지가 무한히 많은 주소로 열린다는 뜻이고,
 * 검색엔진에는 중복 콘텐츠로 보인다. 정규 주소를 알려주지 않으면 공유가 많이
 * 될수록 평가가 갈라지는 역설이 생긴다.
 */
export const setCanonical = (path: string | null): void => {
  if (typeof document === 'undefined') return
  const existing = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!path) {
    existing?.remove()
    return
  }
  const link = existing ?? document.createElement('link')
  link.rel = 'canonical'
  link.href = absoluteUrl(path)
  if (!existing) document.head.appendChild(link)
}

export const currentPath = (): string =>
  `${window.location.pathname}${window.location.search}`

/**
 * 주소를 정규형으로 맞춘다.
 *
 * 장식이 다를 뿐이면 기록을 남기지 않고 바꿔치운다(`replaceState`): 사용자가
 * 뒤로 가기를 눌렀을 때 같은 페이지의 다른 철자로 돌아가면 갇힌다. 선택이
 * 실제로 달라졌을 때만 기록을 쌓는다.
 */
export const syncPath = (path: string | null, { push }: { push: boolean }): void => {
  const target = path ?? '/'
  if (window.location.pathname === target.split('?')[0]) {
    setCanonical(path)
    return
  }
  if (push) window.history.pushState({}, '', target)
  else window.history.replaceState({}, '', target)
  setCanonical(path)
}
