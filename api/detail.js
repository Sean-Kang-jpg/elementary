/**
 * Server-render the head and a readable body for school and complex pages.
 *
 * The app is a single map that mounts client-side, so a crawler sees an empty
 * `<div id="root">`. Google renders JavaScript late and incompletely and Naver's
 * Yeti cannot be relied on to render it at all, which for a Korean product means
 * the sitemap advertises 52,155 addresses that index as blank.
 *
 * This does not server-render the app. A crawler needs a title, a description,
 * the figures and links - not a map - and the concept's screen model already
 * says an external visitor gets a detail page rather than the map, so nothing
 * here has to reproduce the map, the markers or the sheet.
 * See docs/decisions/ADR-006-detail-page-rendering.md.
 *
 * **It fails open.** Any error returns the untouched app shell, so the worst
 * outcome is the behaviour before this existed rather than a broken page. That
 * matters because every visitor to a detail page comes through here, not only
 * crawlers.
 *
 * CommonJS on purpose: there is no package.json at the deploy root, so `.js` is
 * CommonJS and `export default` would not load.
 */

/**
 * The site's public origin, for the canonical link and og:url.
 *
 * This function is deployed from the repository root, so it cannot import the
 * app's resolver at elementary-v2/scripts/site-origin.mjs. It reads the same
 * variable and keeps the same fallback, and public-smoke.mjs asserts that what
 * the two of them actually serve agrees, so the pair cannot drift unnoticed.
 */
const ORIGIN = (process.env.SITE_ORIGIN || process.env.VITE_SITE_ORIGIN
  || 'https://wherecho.co.kr').replace(/\/+$/, '')
const SCHOOL_KEY = /^B\d+$/i
const APARTMENT_KEY = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/i
/**
 * Per-request budget for one upstream call.
 *
 * This is a **per-call** limit, so what matters is how many calls can stack up
 * before the function itself is killed. Vercel allows 10s by default; the first
 * version awaited the shell, then two queries, one after another, so a cold
 * start could spend 12s and be killed before the fail-open `catch` could run.
 * Everything below now runs concurrently, so the worst case is one budget plus
 * overhead rather than three.
 */
const UPSTREAM_TIMEOUT_MS = 6000

const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const number = (value) => (value == null || value === '' ? null : Number(value))
const withCommas = (value) => (value == null ? null : Number(value).toLocaleString('ko-KR'))

const supabase = () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase credentials are not configured')
  return { url: url.replace(/\/$/, ''), key }
}

const query = async (table, params, { timeout = UPSTREAM_TIMEOUT_MS } = {}) => {
  const { url, key } = supabase()
  const search = new URLSearchParams(params)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(`${url}/rest/v1/${table}?${search}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`${table} -> ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Every row, past the 1,000-row cap. Pages run one after another, so callers
 * keep this to reads that are usually one page - a district - or two, 경기.
 * `params` must carry an `order`, or pages can overlap.
 */
const queryAll = async (table, params, maxPages = 5) => {
  const rows = []
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await query(table, { ...params, limit: '1000', offset: String(page * 1000) })
    rows.push(...batch)
    if (batch.length < 1000) break
  }
  return rows
}

/** Mirrors `readable()` in src/utils/urlState.ts, so the canonical path agrees. */
const readable = (parts) =>
  parts
    .filter((part) => part && String(part).trim())
    .join('-')
    .replace(/[\\/?#%&+\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

const REGION_SHORT = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천',
  광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종',
  경기도: '경기', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남',
  전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남',
  제주특별자치도: '제주',
}
const shortRegion = (region) => REGION_SHORT[region] || region || ''
const REGION_BY_SHORT = Object.fromEntries(Object.entries(REGION_SHORT).map(([full, short]) => [short, full]))
/**
 * Sejong has no 시·군·구: its addresses go straight to a road name, so grouping
 * by the second word gives forty one-school "districts". Its hub lists the
 * schools directly instead.
 */
const NO_DISTRICTS = new Set(['세종특별자치시'])

const districtFromAddress = (address, region) => {
  const parts = String(address || '').trim().split(/\s+/)
  // Provinces put a city between region and district (경기도 성남시 분당구).
  const hasCity = /(도|자치도)$/.test(region || '')
  if (!hasCity) return parts[1] || ''
  const city = parts[1] || ''
  const sub = /구$/.test(parts[2] || '') ? parts[2] : ''
  return [city, sub].filter(Boolean).join(' ')
}

const keyFromSlug = (slug) => {
  let decoded = slug
  try { decoded = decodeURIComponent(slug) } catch { /* keep the raw form */ }
  const at = decoded.lastIndexOf('--')
  return (at === -1 ? decoded : decoded.slice(at + 2)).trim().toUpperCase()
}

/**
 * The hub addresses: /area, /area/서울, /area/서울/강남구, /area/경기/성남시-분당구.
 * Mirrors `areaPath()` in src/utils/urlState.ts. Unlike a detail address the
 * names are the key - a district is not renamed the way a complex is, and there
 * is no code for one in the data to anchor to.
 */
const areaPath = (region, district) => {
  if (!region) return '/area'
  const base = `/area/${shortRegion(region)}`
  return district && !NO_DISTRICTS.has(region) ? `${base}/${readable([district])}` : base
}

const schoolPath = (school) =>
  `/school/${readable([shortRegion(school.region), districtFromAddress(school.road_address || school.legal_address, school.region), school.school_name])}--${school.school_id}`

/** Breadcrumb trail for a page inside a region: 전국 › 서울 › 강남구. */
const areaTrail = (region, district) => [
  { name: '전국', path: '/area' },
  ...(region ? [{ name: shortRegion(region), path: areaPath(region) }] : []),
  ...(region && district && !NO_DISTRICTS.has(region) ? [{ name: district, path: areaPath(region, district) }] : []),
]

/** Pooled rather than averaged: a two-class school must not weigh as much as a ten-class one. */
const pooledPerClass = (schools) => {
  const students = schools.reduce((sum, s) => sum + (number(s.grade1_students) || 0), 0)
  const classes = schools.reduce((sum, s) => sum + (number(s.grade1_classes) || 0), 0)
  return classes ? Math.round((students / classes) * 10) / 10 : null
}

const distanceKm = (a, b) => {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLng = (b.longitude - a.longitude) * rad
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

const NEARBY_COUNT = 5
const NEARBY_FIELDS = 'school_id,school_name,region,road_address,legal_address,establishment_type,'
  + 'latitude,longitude,grade1_students,grade1_classes,grade1_per_class,total_students'

/**
 * The closest schools to this one, for the comparison table. A box of about
 * 5 km each way holds the nearest five almost everywhere - about a hundred
 * schools in Seoul, a handful in the country - and PostgREST cannot order by
 * distance, so the box is read and sorted here.
 *
 * It needs the school's coordinates, so it is the one read that waits on
 * another. It gets a shorter budget and is optional: a slow read drops the
 * table and keeps the page.
 */
const nearbySchools = async (school) => {
  const lat = number(school.latitude)
  const lng = number(school.longitude)
  if (lat == null || lng == null) return []
  const rows = await query('school_master', {
    select: NEARBY_FIELDS,
    and: `(latitude.gte.${lat - 0.05},latitude.lte.${lat + 0.05},longitude.gte.${lng - 0.06},longitude.lte.${lng + 0.06})`,
    limit: '400',
  }, { timeout: 3000 })
  const origin = { latitude: lat, longitude: lng }
  return rows
    .filter((row) => row.school_id !== school.school_id && row.latitude != null && row.longitude != null)
    .map((row) => ({ ...row, distance: distanceKm(origin, { latitude: Number(row.latitude), longitude: Number(row.longitude) }) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, NEARBY_COUNT)
}

/**
 * One sentence that differs per school: how its first-grade class size compares
 * with its neighbours'. Mirrors `nearbySummary()` in src/utils/nearbySchools.ts.
 */
const nearbySummary = (school, nearby) => {
  const own = number(school.grade1_per_class) || null
  const theirs = pooledPerClass(nearby)
  if (own == null || theirs == null || !nearby.length) return null
  const diff = Math.round((own - theirs) * 10) / 10
  const verdict = Math.abs(diff) < 0.5 ? '비슷합니다'
    : diff > 0 ? `${diff}명 많습니다` : `${-diff}명 적습니다`
  return `1학년 학급당 학생 수는 ${own}명으로, 가까운 학교 ${nearby.length}곳 평균 ${theirs}명보다 ${verdict}.`
    .replace('보다 비슷합니다', '과 비슷합니다')
}

const comparisonTable = (school, nearby) => {
  const row = (s, current) => {
    const name = escapeHtml(s.school_name) + (s.establishment_type && s.establishment_type !== '공립' ? ` <small>(${escapeHtml(s.establishment_type)})</small>` : '')
    return `<tr${current ? ' class="is-current" aria-current="true"' : ''}>`
      + `<th scope="row">${current ? name : `<a href="${escapeHtml(encodeURI(schoolPath(s)))}">${name}</a>`}</th>`
      + `<td>${current ? '-' : `${s.distance.toFixed(1)}km`}</td>`
      + `<td>${escapeHtml(withCommas(s.grade1_students) ?? '-')}</td>`
      + `<td>${escapeHtml(s.grade1_per_class ?? '-')}</td>`
      + `<td>${escapeHtml(withCommas(s.total_students) ?? '-')}</td></tr>`
  }
  return '<table class="area-table"><thead><tr><th scope="col">학교</th><th scope="col">거리</th>'
    + '<th scope="col">1학년</th><th scope="col">학급당</th><th scope="col">전교생</th></tr></thead><tbody>'
    + row(school, true) + nearby.map((s) => row(s, false)).join('')
    + '</tbody></table>'
}

const schoolPage = async (key) => {
  // The reads select on the same school_id, so none waits for another. Issued
  // together they cost one round trip instead of three - which is what keeps a
  // cold start inside the function's own time limit. The neighbours are the
  // exception - they need this school's coordinates - see nearbySchools().
  const schoolRead = query('school_master', {
    select: 'school_id,school_name,region,road_address,legal_address,establishment_type,'
      + 'latitude,longitude,grade1_students,grade1_classes,grade1_per_class,total_students,reference_date',
    school_id: `eq.${key}`,
    limit: '1',
  })
  const [schools, complexes, care, nearby] = await Promise.all([
    schoolRead,
    query('school_apartment_serving', {
      select: 'canonical_complex_id,complex_name,households,complex_public_key,region,district,road_address',
      school_id: `eq.${key}`,
      limit: '300',
    }),
    // Care (SQL 23) is an extra, not the page: a failed read drops these facts
    // and keeps the rest, rather than failing the page open to the bare shell.
    query('school_care_statistics', {
      select: 'statistics_year,afternoon_care_rooms,afternoon_care_students,evening_care_rooms,'
        + 'afterschool_aptitude_programs,afterschool_curriculum_programs',
      school_id: `eq.${key}`,
      limit: '1',
    }).catch(() => []),
    schoolRead.then((rows) => (rows[0] ? nearbySchools(rows[0]) : [])).catch(() => []),
  ])
  const school = schools[0]
  if (!school) return null
  const unique = new Map()
  for (const row of complexes) {
    if (!unique.has(row.canonical_complex_id)) unique.set(row.canonical_complex_id, row)
  }
  // A complex registered building by building counts once, as a visitor counts it.
  const assigned = collapseBuildings([...unique.values()])
  const households = assigned.reduce((sum, row) => sum + (number(row.households) || 0), 0)
  const district = districtFromAddress(school.road_address || school.legal_address, school.region)
  const place = `${shortRegion(school.region)} ${district}`.trim()
  const careRow = care[0]
  const careRooms = careRow ? number(careRow.afternoon_care_rooms) : null
  const eveningRooms = careRow ? number(careRow.evening_care_rooms) : null
  const programs = careRow
    ? (number(careRow.afterschool_aptitude_programs) || 0) + (number(careRow.afterschool_curriculum_programs) || 0)
    : null

  return {
    canonical: `/school/${readable([shortRegion(school.region), district, school.school_name])}--${school.school_id}`,
    // The product's question is which apartments a school takes, and the count
    // differs per page, which is what keeps results distinguishable.
    title: `${school.school_name} 배정 아파트 ${assigned.length}곳 · ${place} | 어디초`,
    description: [
      `${place} ${school.school_name}에 배정되는 아파트 ${withCommas(assigned.length)}개 단지`,
      households ? `총 ${withCommas(households)}세대` : null,
      number(school.grade1_students) != null
        ? `1학년 ${withCommas(school.grade1_students)}명 · ${withCommas(school.grade1_classes)}학급`
          + (number(school.grade1_per_class) != null ? ` · 학급당 ${school.grade1_per_class}명` : '')
        : null,
      school.reference_date ? `${school.reference_date} 기준 공식 통학구역 자료.` : null,
    ].filter(Boolean).join(', ').replace(/, ([^,]*기준)/, '. $1'),
    heading: `${school.school_name} 배정 아파트`,
    facts: [
      ['지역', place],
      ['설립 유형', school.establishment_type],
      ['1학년 학생 수', withCommas(school.grade1_students)],
      ['1학년 학급 수', withCommas(school.grade1_classes)],
      ['학급당 학생 수', school.grade1_per_class],
      ['전교생', withCommas(school.total_students)],
      ['배정 아파트', `${withCommas(assigned.length)}개 단지`],
      ['배정 총세대수', households ? `${withCommas(households)}세대` : null],
      ['오후 돌봄교실', careRooms ? `${careRooms}실 · ${withCommas(careRow.afternoon_care_students)}명 참여` : careRow ? '공시 없음' : null],
      ['저녁 돌봄교실', careRow ? (eveningRooms ? `운영 ${eveningRooms}실` : '공시 없음') : null],
      ['방과후 프로그램', programs ? `${withCommas(programs)}개` : null],
      ['돌봄·방과후 출처', careRow ? `학교알리미 ${careRow.statistics_year}년 공시` : null],
      ['데이터 기준일', school.reference_date],
    ],
    trail: [...areaTrail(school.region, district), { name: school.school_name }],
    sections: nearby.length
      ? [`<h2>인근 학교와 비교</h2>${nearbySummary(school, nearby) ? `<p>${escapeHtml(nearbySummary(school, nearby))}</p>` : ''}${comparisonTable(school, nearby)}`]
      : [],
    links: assigned
      .filter((row) => row.complex_public_key)
      .sort((a, b) => (number(b.households) || 0) - (number(a.households) || 0))
      .slice(0, 60)
      .map((row) => ({
        href: apartmentPath(row),
        text: `${row.complex_name}${number(row.households) ? ` · ${buildingsNote(row)}${withCommas(row.households)}세대` : ''}`,
      })),
    linksTitle: '배정 아파트',
  }
}

/* ---- One complex registered building by building --------------------------
 *
 * Some complexes are registered one building at a time - 성호샤인힐즈아파트 in
 * 용인 is 41 records, 이현로29번길 72-1 to 72-41, each its own key and page.
 * Those pages differ only in the last digit of the address, and Google indexes
 * one and files the rest as duplicates of a canonical it chose itself. They are
 * grouped here and the group's pages name one representative as canonical; the
 * sitemap lists only that one.
 *
 * The rule is narrow on purpose: same region, district and name, the same road
 * address up to the building's sub-number, and the same schools. A name alone
 * is not enough - most of the 1,053 same-name groups in a district (현대, 제일)
 * are different complexes, and merging those would hide real pages. Those keep
 * their pages and get the road name in the title instead.
 *
 * Mirrored in elementary-v2/scripts/build-seo-files.mjs. Keep the two in step,
 * or the sitemap lists pages whose canonical points elsewhere.
 */

/** `이현로29번길 72-14` -> `이현로29번길 72`. */
const addressBase = (address) => String(address || '').trim().replace(/(\d+)-\d+$/, '$1')
const addressSub = (address) => {
  const match = String(address || '').trim().match(/\d+-(\d+)$/)
  return match ? Number(match[1]) : 0
}

const buildingGroupKey = (complex, schoolIds) => (complex.road_address
  ? [complex.region, complex.district, complex.complex_name, addressBase(complex.road_address), [...schoolIds].sort().join(',')].join('|')
  : null)

/** The lowest building number, so the choice survives a rebuild that reshuffles ids. */
const byBuilding = (a, b) => addressSub(a.road_address) - addressSub(b.road_address)
  || String(a.complex_public_key).localeCompare(String(b.complex_public_key))

/** The road name in an address, to tell apart same-name complexes: 서울특별시 용산구 이촌로 192 -> 이촌로. */
const roadName = (address) => String(address || '').trim().split(/\s+/).filter((part) => /[로길]$/.test(part)).pop() || ''

const apartmentPath = (row, key = row.complex_public_key) =>
  `/apt/${readable([shortRegion(row.region), row.district, row.complex_name])}--${key}`

/**
 * One entry per building group in a school's list of complexes, so 41 records of
 * one complex are one link to its representative, not 41 links. Within one
 * school's list the schools are not compared - a list is already one school's.
 */
const collapseBuildings = (rows) => {
  const groups = new Map()
  for (const row of rows) {
    const id = row.road_address
      ? [row.region, row.district, row.complex_name, addressBase(row.road_address)].join('|')
      : `key:${row.complex_public_key || row.canonical_complex_id}`
    const group = groups.get(id)
    if (!group) {
      groups.set(id, { ...row, buildings: 1 })
      continue
    }
    group.buildings += 1
    group.households = (number(group.households) || 0) + (number(row.households) || 0)
    if (byBuilding(row, group) < 0) Object.assign(group, { complex_public_key: row.complex_public_key, road_address: row.road_address })
  }
  return [...groups.values()]
}
const buildingsNote = (row) => (row.buildings > 1 ? `${row.buildings}개 동 합계 ` : '')

const APARTMENT_FIELDS ='canonical_complex_id,complex_name,road_address,region,district,households,building_count,'
  + 'use_approval_year,parking_per_household,public_rental_ratio,school_id,school_name,assignment_rank,complex_public_key'
const NEIGHBOUR_COUNT = 10

/** Serving rows, one complex per key, each with the set of schools it is assigned to. */
const byPublicKey = (rows) => {
  const complexes = new Map()
  for (const row of rows) {
    if (!row.complex_public_key) continue
    const entry = complexes.get(row.complex_public_key) || { ...row, schoolIds: new Set() }
    entry.schoolIds.add(row.school_id)
    complexes.set(row.complex_public_key, entry)
  }
  return [...complexes.values()]
}

const apartmentPage = async (key) => {
  const rows = await query('school_apartment_serving', {
    select: APARTMENT_FIELDS,
    complex_public_key: `eq.${key}`,
    order: 'assignment_rank.asc',
  })
  if (!rows.length) return null

  const complex = rows[0]
  const place = `${shortRegion(complex.region)} ${complex.district || ''}`.trim()
  const schools = []
  for (const row of rows) {
    if (row.school_name && !schools.some((s) => s.id === row.school_id)) {
      schools.push({ id: row.school_id, name: row.school_name, rank: number(row.assignment_rank) })
    }
  }
  const [primary, ...alternates] = schools
  const ownSchoolIds = new Set(schools.map((s) => s.id))

  // Everything below needs this complex's name or schools, so it waits on the
  // first read, then runs together. Each part is optional: a slow read drops a
  // section and keeps the page, as the school page's neighbours do.
  const optional = (promise) => promise.catch(() => [])
  const [namesakeRows, schoolRows, neighbourRows, academy] = await Promise.all([
    complex.district && complex.complex_name
      ? optional(query('school_apartment_serving', {
        select: 'complex_public_key,complex_name,road_address,region,district,households,building_count,school_id',
        region: `eq.${complex.region}`,
        district: `eq.${complex.district}`,
        complex_name: `eq.${complex.complex_name}`,
        limit: '500',
      }, { timeout: 3000 }))
      : [],
    ownSchoolIds.size
      ? optional(query('school_master', {
        select: AREA_SCHOOL_FIELDS,
        school_id: `in.(${[...ownSchoolIds].join(',')})`,
      }, { timeout: 3000 }))
      : [],
    primary
      ? optional(query('school_apartment_serving', {
        select: 'complex_public_key,complex_name,region,district,road_address,households,use_approval_year',
        school_id: `eq.${primary.id}`,
        order: 'households.desc.nullslast',
        limit: String(NEIGHBOUR_COUNT + 50),
      }, { timeout: 3000 }))
      : [],
    complex.canonical_complex_id
      ? optional(query('apartment_academy_summary', {
        select: 'core_institution_count,extended_institution_count',
        canonical_complex_id: `eq.${complex.canonical_complex_id}`,
        limit: '1',
      }, { timeout: 3000 }))
      : [],
  ])

  // The building group, and the same-name complexes that are not part of it.
  const self = { ...complex, schoolIds: ownSchoolIds }
  const namesakes = byPublicKey(namesakeRows)
  if (!namesakes.some((n) => n.complex_public_key === key)) namesakes.push(self)
  const groupKey = buildingGroupKey(complex, ownSchoolIds)
  const group = groupKey
    ? namesakes.filter((n) => buildingGroupKey(n, n.schoolIds) === groupKey).sort(byBuilding)
    : [self]
  const representative = group[0] || self
  const groupHouseholds = group.reduce((sum, n) => sum + (number(n.households) || 0), 0)
  const groupKeys = new Set(group.map((n) => n.complex_public_key))
  const otherNamesakes = namesakes.filter((n) => !groupKeys.has(n.complex_public_key))
  // Two different 현대 in one district would share a title; the road tells them apart.
  const road = otherNamesakes.length ? roadName(complex.road_address) : ''
  const label = road ? `${complex.complex_name}(${road})` : complex.complex_name

  const scale = [
    number(complex.households) ? `${withCommas(complex.households)}세대` : null,
    number(complex.building_count) ? `${complex.building_count}개 동` : null,
    number(complex.use_approval_year) ? `${complex.use_approval_year}년` : null,
  ].filter(Boolean).join(' · ')

  const schoolById = new Map(schoolRows.map((s) => [s.school_id, s]))
  // The school's own canonical address uses the district from its address, which
  // in some provinces is a level below serving's (수원시 장안구, not 수원시).
  const schoolHref = (school) => (schoolById.has(school.id)
    ? schoolPath(schoolById.get(school.id))
    : `/school/${readable([shortRegion(complex.region), complex.district, school.name])}--${school.id}`)

  const schoolTableHtml = schools.length
    ? '<h2>배정 학교</h2><div class="area-table-wrap"><table class="area-table"><thead><tr><th scope="col">학교</th>'
      + '<th scope="col">1학년</th><th scope="col">학급당</th><th scope="col">전교생</th></tr></thead><tbody>'
      + schools.map((school) => {
        const s = schoolById.get(school.id) || {}
        const extra = school.rank && school.rank > 1 ? ' <small>(추가 배정)</small>' : ''
        return `<tr><th scope="row"><a href="${escapeHtml(encodeURI(schoolHref(school)))}">${escapeHtml(school.name)}</a>${extra}</th>`
          + `<td>${escapeHtml(withCommas(s.grade1_students) ?? '-')}</td>`
          + `<td>${escapeHtml(s.grade1_per_class ?? '-')}</td>`
          + `<td>${escapeHtml(withCommas(s.total_students) ?? '-')}</td></tr>`
      }).join('')
      + '</tbody></table></div>'
    : ''

  const primarySchool = primary && schoolById.get(primary.id)
  const primarySentence = primarySchool && number(primarySchool.grade1_per_class) != null
    ? `${primary.name}의 1학년은 ${withCommas(primarySchool.grade1_students)}명, ${withCommas(primarySchool.grade1_classes)}학급으로 학급당 ${primarySchool.grade1_per_class}명입니다.`
    : null

  const groupHtml = group.length > 1
    ? `<h2>함께 등록된 동 ${withCommas(group.length)}곳</h2>`
      + `<p>이 단지는 건물마다 따로 등록되어 있어, 같은 주소에 함께 등록된 동 ${withCommas(group.length)}곳을 모아 보여줍니다. `
      + `모두 ${escapeHtml(schools.map((s) => s.name).join(', '))}에 배정됩니다.</p><ul>`
      + group.map((n) => `<li>${n.complex_public_key === key ? escapeHtml(n.road_address)
        : `<a href="${escapeHtml(encodeURI(apartmentPath(n)))}">${escapeHtml(n.road_address)}</a>`}`
        + `${number(n.households) ? ` <small>${withCommas(n.households)}세대</small>` : ''}</li>`).join('')
      + '</ul>'
    : ''

  const neighbours = []
  for (const row of collapseBuildings(neighbourRows)) {
    if (!row.complex_public_key || groupKeys.has(row.complex_public_key)) continue
    if (neighbours.some((n) => n.complex_public_key === row.complex_public_key)) continue
    neighbours.push(row)
    if (neighbours.length === NEIGHBOUR_COUNT) break
  }
  const neighboursHtml = neighbours.length
    ? `<h2>${escapeHtml(primary.name)}에 함께 배정되는 아파트</h2><ul>`
      + neighbours.map((n) => `<li><a href="${escapeHtml(encodeURI(apartmentPath(n)))}">${escapeHtml(n.complex_name)}</a>`
        + [number(n.households) ? `${buildingsNote(n)}${withCommas(n.households)}세대` : null, number(n.use_approval_year) ? `${n.use_approval_year}년` : null]
          .filter(Boolean).map((part) => ` <small>${escapeHtml(part)}</small>`).join('')
        + '</li>').join('')
      + `</ul><p><a href="${escapeHtml(encodeURI(schoolHref(primary)))}">${escapeHtml(primary.name)} 배정 아파트 모두 보기</a></p>`
    : ''

  const academyRow = academy[0]
  const academyCore = academyRow ? number(academyRow.core_institution_count) : null
  const academyAll = academyRow ? (academyCore || 0) + (number(academyRow.extended_institution_count) || 0) : null

  return {
    canonical: apartmentPath(complex, representative.complex_public_key),
    // The client keeps this canonical while the page shows this key; see setCanonical() in urlState.ts.
    canonicalForKey: key,
    title: `${label} 배정 초등학교 · ${place} | 어디초`,
    description: [
      `${place} ${complex.complex_name}${scale ? `(${scale})` : ''}의 공식 배정 초등학교는`,
      primary ? `${primary.name}입니다.` : '확인 중입니다.',
      // Multiple assignment belongs here. A result naming one school when two
      // apply misleads before anyone clicks.
      alternates.length ? `${alternates.map((s) => s.name).join(', ')}에도 배정될 수 있습니다.` : null,
      complex.road_address ? `${complex.road_address}.` : null,
    ].filter(Boolean).join(' '),
    heading: `${label} 배정 초등학교`,
    facts: [
      ['지역', place],
      ['주소', complex.road_address],
      ['세대수', withCommas(complex.households)],
      ['함께 등록된 동 합계', group.length > 1 ? `${withCommas(group.length)}개 동 · ${withCommas(groupHouseholds)}세대` : null],
      ['동 수', complex.building_count || null],
      ['사용승인연도', complex.use_approval_year || null],
      ['세대당 주차', complex.parking_per_household],
      ['공공임대 비율', number(complex.public_rental_ratio) ? `${complex.public_rental_ratio}%` : null],
      ['주변 학원·교습소·체육도장', academyAll != null ? `600m 이내 ${withCommas(academyCore || 0)}곳 · 800m 이내 ${withCommas(academyAll)}곳` : null],
    ],
    // Serving's district stops at the city in some provinces (수원시), while the
    // hubs split 수원시 장안구 - the road address gives the hub's level.
    trail: [...areaTrail(complex.region, districtFromAddress(complex.road_address, complex.region)), { name: complex.complex_name }],
    sections: [
      schoolTableHtml + (primarySentence ? `<p>${escapeHtml(primarySentence)}</p>` : ''),
      groupHtml,
      neighboursHtml,
      academyAll != null ? '<p class="area-note">주변 학원·교습소·체육도장은 단지에서 잰 직선거리 기준이며 배정과는 관계가 없습니다.</p>' : '',
    ].filter(Boolean),
    // Links to the schools are in the table above; a list of the same names would repeat them.
    links: schoolTableHtml ? [] : schools.map((school) => ({
      href: schoolHref(school),
      text: school.rank && school.rank > 1 ? `${school.name} (추가 배정)` : school.name,
    })),
    linksTitle: '배정 학교',
  }
}

/* ---- Area hubs ------------------------------------------------------------
 *
 * /area, /area/{시·도}, /area/{시·도}/{시·군·구}. Until these existed the 52,000
 * detail pages were reachable only through the sitemap and each other, which a
 * new domain's crawl budget does not stretch to. The hubs give every school a
 * path from the home in three clicks, and answer the search one level above a
 * school - "강남구 초등학교 배정" - with a comparison no single detail page has.
 *
 * Unlike a detail page a visitor reads this one as it is: the app shows the
 * fetched #root (src/components/content/AreaPage.tsx), so the markup carries the
 * content-page classes and is styled in src/styles/content.css.
 */

const AREA_SCHOOL_FIELDS = 'school_id,school_name,region,road_address,legal_address,establishment_type,'
  + 'grade1_students,grade1_classes,grade1_per_class,total_students,reference_date'

const byName = (a, b) => a.school_name.localeCompare(b.school_name, 'ko')
const latestDate = (schools) => schools.map((s) => s.reference_date).filter(Boolean).sort().pop() || null

const nationalPage = () => ({
  canonical: '/area',
  title: '전국 초등학교 배정 현황 · 시·도별 | 어디초',
  description: '전국 17개 시·도의 초등학교 배정 아파트와 1학년 학급당 학생 수를 지역별로 확인하세요. 공식 통학구역 자료 기준.',
  heading: '지역별 초등학교 배정 현황',
  trail: [{ name: '전국' }],
  sections: [
    '<h2>시·도</h2><ul class="area-links">'
    + Object.entries(REGION_SHORT).map(([full, short]) =>
      `<li><a href="${escapeHtml(encodeURI(areaPath(full)))}">${escapeHtml(short)}</a></li>`).join('')
    + '</ul>',
  ],
})

const schoolTable = (schools, assignedBySchool) =>
  '<div class="area-table-wrap"><table class="area-table"><thead><tr><th scope="col">학교</th>'
  + '<th scope="col">1학년</th><th scope="col">학급당</th><th scope="col">전교생</th><th scope="col">배정 단지</th></tr></thead><tbody>'
  + schools.map((s) => {
    const type = s.establishment_type && s.establishment_type !== '공립' ? ` <small>(${escapeHtml(s.establishment_type)})</small>` : ''
    const assigned = assignedBySchool.get(s.school_id) || []
    return `<tr><th scope="row"><a href="${escapeHtml(encodeURI(schoolPath(s)))}">${escapeHtml(s.school_name)}</a>${type}</th>`
      + `<td>${escapeHtml(withCommas(s.grade1_students) ?? '-')}</td>`
      + `<td>${escapeHtml(s.grade1_per_class ?? '-')}</td>`
      + `<td>${escapeHtml(withCommas(s.total_students) ?? '-')}</td>`
      + `<td>${assigned.length ? withCommas(collapseBuildings(assigned).length) : '-'}</td></tr>`
  }).join('')
  + '</tbody></table></div>'

const APARTMENTS_PER_SCHOOL = 5

/** The largest complexes each school takes - the links that carry a crawler on to /apt/. */
const schoolApartmentLists = (schools, assignedBySchool) =>
  schools
    .filter((s) => (assignedBySchool.get(s.school_id) || []).length)
    .map((s) => {
      const assigned = assignedBySchool.get(s.school_id)
      const top = collapseBuildings(assigned)
        .filter((row) => row.complex_public_key)
        .sort((a, b) => (number(b.households) || 0) - (number(a.households) || 0))
        .slice(0, APARTMENTS_PER_SCHOOL)
      const more = collapseBuildings(assigned).length - top.length
      return `<section class="area-school"><h3><a href="${escapeHtml(encodeURI(schoolPath(s)))}">${escapeHtml(s.school_name)}</a></h3><ul>`
        + top.map((row) => `<li><a href="${escapeHtml(encodeURI(apartmentPath(row)))}">`
          + `${escapeHtml(row.complex_name)}</a>${number(row.households) ? ` <small>${buildingsNote(row)}${withCommas(row.households)}세대</small>` : ''}</li>`).join('')
        + '</ul>'
        + (more > 0 ? `<p class="area-school__more"><a href="${escapeHtml(encodeURI(schoolPath(s)))}">배정 단지 ${withCommas(collapseBuildings(assigned).length)}곳 모두 보기</a></p>` : '')
        + '</section>'
    }).join('')

/**
 * A district's schools side by side, and the complexes each one takes. Sejong's
 * region page is one of these too - it has no districts to list.
 */
const schoolListPage = async ({ region, district, schools }) => {
  const ids = schools.map((s) => s.school_id)
  const serving = await queryAll('school_apartment_serving', {
    select: 'school_id,canonical_complex_id,complex_name,households,complex_public_key,region,district,road_address',
    school_id: `in.(${ids.join(',')})`,
    order: 'school_id.asc,canonical_complex_id.asc',
  })
  const assignedBySchool = new Map()
  const complexes = new Map()
  for (const row of serving) {
    const list = assignedBySchool.get(row.school_id) || []
    if (!list.some((r) => r.canonical_complex_id === row.canonical_complex_id)) list.push(row)
    assignedBySchool.set(row.school_id, list)
    complexes.set(row.canonical_complex_id, row)
  }
  const households = [...complexes.values()].reduce((sum, row) => sum + (number(row.households) || 0), 0)
  const complexCount = collapseBuildings([...complexes.values()]).length
  const firstGrade = schools.reduce((sum, s) => sum + (number(s.grade1_students) || 0), 0)
  const perClass = pooledPerClass(schools)
  const asOf = latestDate(schools)
  const place = district ? `${shortRegion(region)} ${district}` : shortRegion(region)
  const sorted = [...schools].sort(byName)

  return {
    canonical: areaPath(region, district),
    title: `${place} 초등학교 ${schools.length}곳 배정 아파트·학급당 학생 수 | 어디초`,
    description: `${place} 초등학교 ${withCommas(schools.length)}곳에 배정되는 아파트 ${withCommas(complexCount)}개 단지와 `
      + '학교별 1학년 학생 수·학급당 학생 수를 비교합니다.'
      + (asOf ? ` ${asOf} 기준 공식 통학구역 자료.` : ''),
    heading: `${place} 초등학교 배정 현황`,
    trail: areaTrail(region, district).map((step, index, all) => (index === all.length - 1 ? { name: step.name } : step)),
    facts: [
      ['초등학교', `${withCommas(schools.length)}곳`],
      ['배정 아파트', `${withCommas(complexCount)}개 단지`],
      ['배정 총세대수', households ? `${withCommas(households)}세대` : null],
      ['1학년 학생 수', firstGrade ? `${withCommas(firstGrade)}명` : null],
      ['1학년 학급당 학생 수', perClass != null ? `평균 ${perClass}명` : null],
      ['데이터 기준일', asOf],
    ],
    sections: [
      `<h2>학교별 비교</h2>${schoolTable(sorted, assignedBySchool)}`,
      complexes.size ? `<h2>학교별 주요 배정 아파트</h2>${schoolApartmentLists(sorted, assignedBySchool)}` : '',
      '<p class="area-note">학급당 학생 수는 1학년 기준이며, 평균은 학생 수 합계를 학급 수 합계로 나눈 값입니다. '
        + '사립·국립 초등학교는 통학구역 배정이 없습니다. 출처: 학교알리미, 학구도 공식 통학구역.</p>',
    ],
  }
}

const regionSchools = (region, extra = {}) => queryAll('school_master', {
  select: AREA_SCHOOL_FIELDS,
  region: `eq.${region}`,
  order: 'school_id.asc',
  ...extra,
})

const regionPage = async (region) => {
  const schools = await regionSchools(region)
  if (!schools.length) return null
  if (NO_DISTRICTS.has(region)) return schoolListPage({ region, district: null, schools })

  const districts = new Map()
  for (const s of schools) {
    const district = districtFromAddress(s.road_address || s.legal_address, s.region)
    if (!district) continue
    if (!districts.has(district)) districts.set(district, [])
    districts.get(district).push(s)
  }
  const place = shortRegion(region)
  const asOf = latestDate(schools)
  const rows = [...districts.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'))
  return {
    canonical: areaPath(region),
    title: `${place} 초등학교 배정 현황 · 시·군·구 ${rows.length}곳 | 어디초`,
    description: `${place} ${rows.length}개 시·군·구 초등학교 ${withCommas(schools.length)}곳의 배정 아파트와 `
      + '1학년 학급당 학생 수를 지역별로 확인하세요.'
      + (asOf ? ` ${asOf} 기준.` : ''),
    heading: `${place} 초등학교 배정 현황`,
    trail: [{ name: '전국', path: '/area' }, { name: place }],
    facts: [
      ['시·군·구', `${rows.length}곳`],
      ['초등학교', `${withCommas(schools.length)}곳`],
      ['1학년 학급당 학생 수', pooledPerClass(schools) != null ? `평균 ${pooledPerClass(schools)}명` : null],
      ['데이터 기준일', asOf],
    ],
    sections: [
      '<h2>시·군·구별</h2><div class="area-table-wrap"><table class="area-table"><thead><tr><th scope="col">시·군·구</th>'
      + '<th scope="col">학교</th><th scope="col">1학년</th><th scope="col">학급당</th></tr></thead><tbody>'
      + rows.map(([district, list]) => `<tr><th scope="row"><a href="${escapeHtml(encodeURI(areaPath(region, district)))}">${escapeHtml(district)}</a></th>`
        + `<td>${withCommas(list.length)}</td>`
        + `<td>${withCommas(list.reduce((sum, s) => sum + (number(s.grade1_students) || 0), 0))}</td>`
        + `<td>${escapeHtml(pooledPerClass(list) ?? '-')}</td></tr>`).join('')
      + '</tbody></table></div>',
      '<p class="area-note">학급당 학생 수는 1학년 학생 수 합계를 학급 수 합계로 나눈 값입니다. 출처: 학교알리미.</p>',
    ],
  }
}

const districtPage = async (region, segment) => {
  if (NO_DISTRICTS.has(region)) return null
  // The address holds the readable form (성남시-분당구), so its last word narrows
  // the read and the exact district is matched after splitting each address.
  const last = segment.split('-').pop()
  if (!last || /[*,()]/.test(last)) return null
  const candidates = await regionSchools(region, {
    or: `(road_address.ilike.*${last}*,legal_address.ilike.*${last}*)`,
  })
  let district = null
  const schools = candidates.filter((s) => {
    const own = districtFromAddress(s.road_address || s.legal_address, s.region)
    if (readable([own]) !== segment) return false
    district = own
    return true
  })
  if (!schools.length) return null
  return schoolListPage({ region, district, schools })
}

const areaPage = async (slug) => {
  const segments = slug.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part) } catch { return part }
  })
  if (!segments.length) return nationalPage()
  const region = REGION_BY_SHORT[segments[0]]
  if (!region || segments.length > 2) return null
  return segments.length === 1 ? regionPage(region) : districtPage(region, segments[1])
}

/** Breadcrumb links - the visible trail and the trail's last step unlinked. */
const renderTrail = (trail) => (trail && trail.length
  ? '<nav class="area-trail" aria-label="위치"><ol>'
    + trail.map((step) => `<li>${step.path ? `<a href="${escapeHtml(encodeURI(step.path))}">${escapeHtml(step.name)}</a>` : `<span aria-current="page">${escapeHtml(step.name)}</span>`}</li>`).join('')
    + '</ol></nav>'
  : '')

const renderFacts = (facts) => (facts || [])
  .filter(([, value]) => value != null && value !== '')
  .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
  .join('')

/**
 * The content a crawler reads. React clears `#root` when it mounts, so a visitor
 * sees this only for the moment before the app takes over.
 */
const renderBody = (page) => {
  const facts = renderFacts(page.facts)
  const links = (page.links || [])
    .map((link) => `<li><a href="${escapeHtml(encodeURI(link.href))}">${escapeHtml(link.text)}</a></li>`)
    .join('')
  return '<article>'
    + renderTrail(page.trail)
    + `<h1>${escapeHtml(page.heading)}</h1>`
    + `<p>${escapeHtml(page.description)}</p>`
    + (facts ? `<dl>${facts}</dl>` : '')
    + (page.sections || []).join('')
    + (links ? `<h2>${escapeHtml(page.linksTitle)}</h2><ul>${links}</ul>` : '')
    + '</article>'
}

/** A hub: what the app shows a visitor as well, so it carries the page classes. */
const renderAreaBody = (page) => {
  // dl > div pairs, so each figure lays out as one tile.
  const facts = (page.facts || [])
    .filter(([, value]) => value != null && value !== '')
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('')
  return '<section class="app-destination app-page content-page area-page" aria-labelledby="area-title" data-area-page>'
    + '<article class="content-page__inner">'
    + renderTrail(page.trail)
    + `<h1 id="area-title">${escapeHtml(page.heading)}</h1>`
    + `<p class="content-page__lead">${escapeHtml(page.description)}</p>`
    + (facts ? `<dl class="area-facts">${facts}</dl>` : '')
    + (page.sections || []).join('')
    + '</article></section>'
}

/** schema.org BreadcrumbList for the trail. `<` is escaped so the JSON cannot close its script. */
const breadcrumbJson = (trail, canonical) => {
  if (!trail || trail.length < 2) return null
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: step.path ? ORIGIN + encodeURI(step.path) : canonical,
    })),
  })
  return `<script type="application/ld+json">${json.replace(/</g, '\\u003c')}</script>`
}

const inject = (shell, page) => {
  const canonical = ORIGIN + encodeURI(page.canonical)
  const head = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}"${page.canonicalForKey ? ` data-for-key="${escapeHtml(page.canonicalForKey)}"` : ''}>`,
    `<meta property="og:title" content="${escapeHtml(page.title)}">`,
    `<meta property="og:description" content="${escapeHtml(page.description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    // og:type, og:site_name and og:locale stay as the shell set them: they are
    // the same on every page, so repeating them here would only duplicate.
    breadcrumbJson(page.trail, canonical),
  ].filter(Boolean).join('\n    ')

  return shell
    // The shell carries its own title, description, canonical and og: tags, so
    // that the map page and any fail-open response still preview correctly when
    // shared. They describe the map, not this page, and leaving them in would give
    // the page two canonicals and two of each og: tag - so they come out first.
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:(?:title|description|url)"[^>]*>\s*/gi, '')
    .replace('</head>', `  ${head}\n  </head>`)
    // The shell's #root is empty. The home page's is not - it carries the home's
    // own prerendered content between markers - and it is what fetchShell falls
    // back to, so a detail page must replace that content rather than append to it.
    .replace(ROOT, `<div id="root">${page.area ? renderAreaBody(page) : renderBody(page)}</div>`)
}

/** An empty #root, or one holding the home's marked prerendered content. */
const ROOT = /<div id="root">(?:<!--prerender:home-->[\s\S]*?<!--\/prerender:home-->)?<\/div>/

/**
 * The application shell, as a static file.
 *
 * `app.html` is the shell (ADR-008 section 3); `index.html` is becoming the home.
 * The home boots the same app, so it is a working shell too - only its head and
 * #root describe the home, and inject() replaces both. Falling back to it means a
 * deploy that lost app.html degrades to the old behaviour instead of failing every
 * detail page, which is the one outcome this function exists to prevent.
 */
const SHELL_PATHS = ['/app.html', '/index.html']

const fetchShell = async (req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    let lastStatus = null
    for (const shellPath of SHELL_PATHS) {
      // A static file wins over a rewrite, so this returns the real file rather
      // than looping back into this function.
      const response = await fetch(`${proto}://${host}${shellPath}`, { signal: controller.signal })
      if (response.ok) return await response.text()
      lastStatus = response.status
    }
    throw new Error(`shell -> ${lastStatus}`)
  } finally {
    clearTimeout(timer)
  }
}

module.exports = async (req, res) => {
  let shell = null
  try {
    const url = new URL(req.url, 'https://placeholder.invalid')
    const type = url.searchParams.get('type')
    const slug = url.searchParams.get('slug') || ''
    const key = keyFromSlug(slug)

    // The shell is a static file and the data comes from Supabase; neither needs
    // the other. Awaiting them in turn was what pushed the school route over the
    // limit, where it fell back to the bare shell on every cold start.
    let lookup = Promise.resolve(null)
    if (type === 'school' && SCHOOL_KEY.test(key)) lookup = schoolPage(key)
    else if (type === 'apt' && APARTMENT_KEY.test(key)) lookup = apartmentPage(key)
    // A hub's slug is the whole rest of the path, not a key.
    else if (type === 'area') lookup = areaPage(slug).then((page) => page && { ...page, area: true })

    const [fetchedShell, page] = await Promise.all([fetchShell(req), lookup])
    shell = fetchedShell

    if (!page) {
      // An address that names nothing must not be indexed as though it did.
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'public, s-maxage=60')
      res.status(404).send(shell)
      return
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).send(inject(shell, page))
  } catch (error) {
    // Fail open. A visitor gets the app exactly as before this existed; only the
    // crawler loses the prerendered head, and that is recoverable.
    console.error('prerender failed, serving the shell:', error && error.message)
    try {
      const fallback = shell || await fetchShell(req)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).send(fallback)
    } catch (shellError) {
      console.error('shell fetch failed too:', shellError && shellError.message)
      res.status(500).send('Temporarily unavailable')
    }
  }
}

// Exported for local verification without a deployment.
module.exports.__test = {
  inject, renderBody, renderAreaBody, keyFromSlug, readable, districtFromAddress, fetchShell,
  areaPage, areaPath, schoolPage, apartmentPage, nearbySummary, buildingGroupKey, byBuilding,
}
