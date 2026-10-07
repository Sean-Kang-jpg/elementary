import type { Apartment, School } from '../types'
import { findRegion } from '../constants/regionRegistry'

/**
 * 주소와 화면을 잇는다.
 *
 * 화면: 홈(`/`), 지도(`/map`과 상세), 가이드(`/guide`, `/guide/{slug}`), FAQ, 학습 준비(`/learn`), 소식,
 * MY(`/my`, 옛 주소 `/favorites`), 개인정보처리방침, 지역 허브(`/area`, `/area/서울`,
 * `/area/서울/강남구`). 지도 쪽에서는
 * 여전히 주소가 선택을 비춘다 — `/map`, `/school/…`, `/apt/…`는 같은 지도 위에서
 * 선택만 다른 같은 화면이고, 셋 사이를 오갈 때 지도 인스턴스를 다시 만들지 않는다.
 * 라우팅 라이브러리를 쓰지 않는 이유는 ADR-008 2절이다. 경로가 몇 개뿐이고 중첩이
 * 없는데, 라이브러리를 넣으면 이 선택 동기화를 그 위에 다시 짜야 한다.
 *
 * 상세 주소 모양 (ADR-007):
 *
 *     /apt/서울-강남구-은마--7A2EMR5J
 *     /school/서울-강남구-서울대현초등학교--B000002292
 *
 * **마지막 `--` 뒤의 값만 권위를 가진다.** 앞부분은 읽으라고 붙인 장식이며
 * 해석하지 않는다. 아파트는 개명되므로(그래서 `apartment_name_history`가
 * 있다) 이름을 주소의 진실로 삼으면 개명될 때마다 링크가 죽는다.
 */

export type Route =
  | { kind: 'home' }
  | { kind: 'map' }
  | { kind: 'news' }
  | { kind: 'my' }
  | { kind: 'privacy' }
  | { kind: 'guide'; slug: string | null }
  | { kind: 'faq' }
  | { kind: 'checklist' }
  | { kind: 'learn' }
  | { kind: 'area'; path: string }
  | { kind: 'admin' }
  | { kind: 'school'; key: string }
  | { kind: 'apartment'; key: string }

/** 화면 단위. 상세 두 종류는 지도 화면 위의 선택이다. */
export type AppView = 'home' | 'map' | 'guide' | 'faq' | 'checklist' | 'learn' | 'area' | 'news' | 'my' | 'privacy'

export const viewOf = (route: Route): AppView => {
  if (route.kind === 'school' || route.kind === 'apartment' || route.kind === 'map') return 'map'
  if (route.kind === 'news' || route.kind === 'my' || route.kind === 'privacy' || route.kind === 'learn') return route.kind
  if (route.kind === 'guide' || route.kind === 'faq' || route.kind === 'checklist' || route.kind === 'area') return route.kind
  return 'home'
}

/** 화면마다 하나인 주소. 상세는 선택에 따라 정해지므로 여기 없다. */
export const VIEW_PATHS: Record<AppView, string> = {
  home: '/',
  map: '/map',
  news: '/news',
  my: '/my',
  privacy: '/privacy',
  guide: '/guide',
  faq: '/faq',
  checklist: '/checklist',
  learn: '/learn',
  area: '/area',
}

export const guidePath = (slug: string): string => `/guide/${slug}`

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
  // 지역 허브는 이름이 곧 주소다. 맞는 지역인지는 서버(api/detail.js)가 판단하고,
  // 여기서는 정규 철자로만 맞춘다.
  if (segments[0] === 'area' && segments.length <= 3) {
    return { kind: 'area', path: ['', ...segments.map(safeDecode)].join('/') }
  }
  if (segments.length === 1) {
    if (segments[0] === 'map') return { kind: 'map' }
    if (segments[0] === 'news') return { kind: 'news' }
    if (segments[0] === 'my') return { kind: 'my' }
    // 2026-10-04까지의 즐겨찾기 탭. 북마크가 남아 있으므로 MY로 받는다.
    if (segments[0] === 'favorites') return { kind: 'my' }
    if (segments[0] === 'privacy') return { kind: 'privacy' }
    if (segments[0] === 'guide') return { kind: 'guide', slug: null }
    if (segments[0] === 'faq') return { kind: 'faq' }
    if (segments[0] === 'checklist') return { kind: 'checklist' }
    if (segments[0] === 'learn') return { kind: 'learn' }
  }
  // 모르는 주소는 홈으로 연다. 404 화면이 없으므로 가장 쓸모 있는 착지점이다.
  if (segments.length !== 2) return { kind: 'home' }

  const [prefix, slug] = segments
  // 가이드 주소는 장식 없이 slug 그대로다. 모르는 slug는 가이드 화면이 목록으로 받는다.
  if (prefix === 'guide') return { kind: 'guide', slug: safeDecode(slug) }
  const key = keyOf(slug)

  if (prefix === 'school' && SCHOOL_KEY.test(key)) {
    return { kind: 'school', key: key.toUpperCase() }
  }
  if (prefix === 'apt' && APARTMENT_KEY.test(key)) {
    return { kind: 'apartment', key: key.toUpperCase() }
  }
  return { kind: 'home' }
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

/**
 * 학교가 속한 시·군·구 허브. 서버의 `areaPath()`(api/detail.js)와 같은 규칙이다.
 * 세종은 시·군·구가 없어 시 허브가 학교 목록을 보여준다.
 */
export const areaPath = (school: Pick<School, 'region' | 'district'>): string => {
  const region = shortRegion(school.region)
  if (!region) return VIEW_PATHS.area
  const district = school.region === '세종특별자치시' ? '' : readable([school.district])
  return district ? `/area/${region}/${district}` : `/area/${region}`
}

/** 공유되거나 색인될 때 쓰이는 절대 주소. */
export const absoluteUrl = (path: string): string =>
  typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString()

/**
 * 동마다 따로 등록된 단지는 서버(api/detail.js)가 대표 동의 주소를 canonical로
 * 정하고 이 페이지의 키를 data-for-key에 남긴다. 앱이 그 키를 보여주는 동안에는
 * 서버의 canonical을 쓴다. 자기 주소로 덮어쓰면 렌더링한 검색엔진이 서로 다른
 * canonical 둘을 보게 된다. 첫 화면이 링크를 지웠다 다시 만들 수 있으므로 모듈을
 * 읽을 때 한 번 받아 둔다.
 */
const serverCanonical = (() => {
  if (typeof document === 'undefined') return null
  const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"][data-for-key]')
  return link?.dataset.forKey ? { key: link.dataset.forKey.toUpperCase(), href: link.href } : null
})()

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
  const key = path.slice(path.lastIndexOf(KEY_SEPARATOR) + KEY_SEPARATOR.length).toUpperCase()
  const link = existing ?? document.createElement('link')
  link.rel = 'canonical'
  link.href = serverCanonical && path.includes(KEY_SEPARATOR) && key === serverCanonical.key
    ? serverCanonical.href
    : absoluteUrl(path)
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
export const syncPath = (
  path: string,
  { push, state = {} }: { push: boolean; state?: Record<string, unknown> },
): void => {
  // 브라우저의 pathname은 퍼센트 인코딩돼 있고 우리가 만든 주소는 한글 그대로다.
  // 같은 형태로 맞춰 비교하지 않으면 같은 주소를 기록에 거듭 쌓아, 뒤로 가기가
  // 제자리에서 맴돈다.
  if (window.location.pathname === new URL(path, window.location.origin).pathname) {
    setCanonical(path)
    return
  }
  if (push) window.history.pushState(state, '', path)
  else window.history.replaceState(state, '', path)
  setCanonical(path)
}
