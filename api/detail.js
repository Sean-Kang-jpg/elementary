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

const query = async (table, params) => {
  const { url, key } = supabase()
  const search = new URLSearchParams(params)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
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

const schoolPage = async (key) => {
  // The reads select on the same school_id, so none waits for another. Issued
  // together they cost one round trip instead of three - which is what keeps a
  // cold start inside the function's own time limit.
  const [schools, complexes, care] = await Promise.all([
    query('school_master', {
      select: 'school_id,school_name,region,road_address,legal_address,establishment_type,'
        + 'grade1_students,grade1_classes,grade1_per_class,total_students,reference_date',
      school_id: `eq.${key}`,
      limit: '1',
    }),
    query('school_apartment_serving', {
      select: 'canonical_complex_id,complex_name,households,complex_public_key,region,district',
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
  ])
  const school = schools[0]
  if (!school) return null
  const unique = new Map()
  for (const row of complexes) {
    if (!unique.has(row.canonical_complex_id)) unique.set(row.canonical_complex_id, row)
  }
  const assigned = [...unique.values()]
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
    links: assigned
      .filter((row) => row.complex_public_key)
      .sort((a, b) => (number(b.households) || 0) - (number(a.households) || 0))
      .slice(0, 60)
      .map((row) => ({
        href: `/apt/${readable([shortRegion(row.region), row.district, row.complex_name])}--${row.complex_public_key}`,
        text: `${row.complex_name}${number(row.households) ? ` · ${withCommas(row.households)}세대` : ''}`,
      })),
    linksTitle: '배정 아파트',
  }
}

const apartmentPage = async (key) => {
  const rows = await query('school_apartment_serving', {
    select: 'complex_name,road_address,region,district,households,building_count,use_approval_year,'
      + 'parking_per_household,public_rental_ratio,school_id,school_name,assignment_rank,complex_public_key',
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
  const scale = [
    number(complex.households) ? `${withCommas(complex.households)}세대` : null,
    number(complex.building_count) ? `${complex.building_count}개 동` : null,
    number(complex.use_approval_year) ? `${complex.use_approval_year}년` : null,
  ].filter(Boolean).join(' · ')

  return {
    canonical: `/apt/${readable([shortRegion(complex.region), complex.district, complex.complex_name])}--${key}`,
    title: `${complex.complex_name} 배정 초등학교 · ${place} | 어디초`,
    description: [
      `${place} ${complex.complex_name}${scale ? `(${scale})` : ''}의 공식 배정 초등학교는`,
      primary ? `${primary.name}입니다.` : '확인 중입니다.',
      // Multiple assignment belongs here. A result naming one school when two
      // apply misleads before anyone clicks.
      alternates.length ? `${alternates.map((s) => s.name).join(', ')}에도 배정될 수 있습니다.` : null,
      complex.road_address ? `${complex.road_address}.` : null,
    ].filter(Boolean).join(' '),
    heading: `${complex.complex_name} 배정 초등학교`,
    facts: [
      ['지역', place],
      ['주소', complex.road_address],
      ['세대수', withCommas(complex.households)],
      ['동 수', complex.building_count || null],
      ['사용승인연도', complex.use_approval_year || null],
      ['세대당 주차', complex.parking_per_household],
      ['공공임대 비율', number(complex.public_rental_ratio) ? `${complex.public_rental_ratio}%` : null],
      ['배정 학교', schools.map((s) => s.name).join(', ')],
    ],
    links: schools.map((school) => ({
      href: `/school/${readable([shortRegion(complex.region), complex.district, school.name])}--${school.id}`,
      text: school.rank && school.rank > 1 ? `${school.name} (추가 배정)` : school.name,
    })),
    linksTitle: '배정 학교',
  }
}

/**
 * The content a crawler reads. React clears `#root` when it mounts, so a visitor
 * sees this only for the moment before the app takes over.
 */
const renderBody = (page) => {
  const facts = page.facts
    .filter(([, value]) => value != null && value !== '')
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('')
  const links = page.links
    .map((link) => `<li><a href="${escapeHtml(encodeURI(link.href))}">${escapeHtml(link.text)}</a></li>`)
    .join('')
  return '<article>'
    + `<h1>${escapeHtml(page.heading)}</h1>`
    + `<p>${escapeHtml(page.description)}</p>`
    + (facts ? `<dl>${facts}</dl>` : '')
    + (links ? `<h2>${escapeHtml(page.linksTitle)}</h2><ul>${links}</ul>` : '')
    + '</article>'
}

const inject = (shell, page) => {
  const canonical = ORIGIN + encodeURI(page.canonical)
  const head = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:title" content="${escapeHtml(page.title)}">`,
    `<meta property="og:description" content="${escapeHtml(page.description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    // og:type, og:site_name and og:locale stay as the shell set them: they are
    // the same on every page, so repeating them here would only duplicate.
  ].join('\n    ')

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
    .replace(ROOT, `<div id="root">${renderBody(page)}</div>`)
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
module.exports.__test = { inject, renderBody, keyFromSlug, readable, districtFromAddress, fetchShell }
