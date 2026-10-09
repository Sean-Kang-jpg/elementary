/**
 * Write the crawler-facing files into the build output: robots.txt and the
 * sitemaps.
 *
 * Generated at build time rather than served from a function: there are about
 * 52,000 URLs, so a request-time build would read tens of thousands of rows on
 * every crawl and sit close to the function timeout. A static file answers
 * instantly and is rebuilt on every deploy, which is fresh enough - search
 * engines re-crawl, and regions are promoted rarely.
 *
 * The paths must match what the app produces, or the sitemap advertises
 * addresses that redirect. The rules live in src/utils/urlState.ts and the
 * readable-part logic is mirrored here deliberately - this runs in Node before
 * the bundle exists, so it cannot import from the app.
 *
 *     node scripts/generate-sitemap.mjs            # writes dist/
 *     SITE_ORIGIN=https://example.com node ...     # override the origin
 */

import { createRequire } from 'node:module'
import { siteOrigin, siteOriginIsDefault } from './site-origin.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(projectRoot, 'dist')
/** Sitemaps allow 50,000 URLs each; well under it keeps each file small to fetch. */
const URLS_PER_FILE = 10_000
const PAGE = 1000

const require = createRequire(import.meta.url)

const readEnvFile = async () => {
  try {
    const text = await fs.readFile(path.join(projectRoot, '.env'), 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const [key, ...rest] = trimmed.split('=')
      if (!process.env[key]) process.env[key] = rest.join('=')
    }
  } catch {
    // Vercel supplies the variables directly; a missing .env is normal there.
  }
}

/**
 * Region short names and which regions carry a city level, from the generated
 * registry the app also reads. Parsed rather than imported because this runs
 * before the bundle exists.
 */
const loadRegions = () => {
  const source = require('fs').readFileSync(
    path.join(projectRoot, 'src/constants/regionRegistry.ts'), 'utf8')
  const regions = new Map()
  let canonicalName = null
  let shortName = null
  // Read line by line rather than with one regex: the pattern would have to
  // survive a JS string literal, and an escape lost there matches nothing while
  // still looking correct.
  for (const line of source.split(/\r?\n/)) {
    const value = line.split(':').slice(1).join(':').trim().replace(/,$/, '')
    const unquoted = value.replace(/^'|'$/g, '')
    if (line.includes('canonicalName:')) {
      canonicalName = unquoted
      shortName = null
    } else if (line.includes('shortName:')) {
      shortName = unquoted
    } else if (line.includes('hasCityLevel:') && canonicalName && shortName) {
      regions.set(canonicalName, { shortName, hasCityLevel: value === 'true' })
      canonicalName = null
      shortName = null
    }
  }
  if (!regions.size) throw new Error('could not read regions from the generated registry')
  return regions
}

/**
 * Mirrors `addressParts()` in src/services/dataService.ts.
 *
 * `school_master` has no district column - the app splits the address, because
 * provinces put a city between region and district (경기도 성남시 분당구) while
 * metropolitan cities go straight to it. The sitemap has to split it the same
 * way or it advertises addresses that immediately redirect.
 */
const districtOf = (address, regions) => {
  const parts = String(address || '').trim().split(/\s+/)
  const hasCityLevel = regions.get(parts[0] || '')?.hasCityLevel ?? false
  if (!hasCityLevel) return parts[1] || ''
  const city = parts[1] || ''
  const subDistrict = /구$/.test(parts[2] || '') ? parts[2] : ''
  return [city, subDistrict].filter(Boolean).join(' ')
}

/** Mirrors NO_DISTRICTS in api/detail.js: Sejong's hub lists its schools directly. */
const NO_DISTRICTS = new Set(['세종특별자치시'])

/** Mirrors `readable()` in src/utils/urlState.ts. Keep the two in step. */
const readable = (parts) =>
  parts
    .filter((part) => part && String(part).trim())
    .join('-')
    .replace(/[\\/?#%&+\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Mirrors `buildingGroupKey()` and `byBuilding()` in api/detail.js, which says
 * why: a complex registered one building at a time (이현로29번길 72-1 ... 72-41)
 * is one page with its buildings' pages pointing at it as canonical.
 */
const addressBase = (address) => String(address || '').trim().replace(/(\d+)-\d+$/, '$1')
const addressSub = (address) => {
  const match = String(address || '').trim().match(/\d+-(\d+)$/)
  return match ? Number(match[1]) : 0
}
const buildingGroupKey = (complex, schoolIds) => (complex.road_address
  ? [complex.region, complex.district, complex.complex_name, addressBase(complex.road_address), [...schoolIds].sort().join(',')].join('|')
  : null)
const byBuilding = (a, b) => addressSub(a.road_address) - addressSub(b.road_address)
  || String(a.complex_public_key).localeCompare(String(b.complex_public_key))

const credentials = () => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
  }
  return { url: url.replace(/\/$/, ''), key }
}

const fetchAll = async ({ url, key }, table, select) => {
  const rows = []
  for (let offset = 0; ; offset += PAGE) {
    const query = new URLSearchParams({ select, limit: String(PAGE), offset: String(offset) })
    const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (response.status === 416) break
    if (!response.ok) {
      throw new Error(`${table} -> ${response.status}: ${(await response.text()).slice(0, 200)}`)
    }
    const page = await response.json()
    if (!page.length) break
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

const xmlEscape = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const urlSet = (paths, origin) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + paths.map((p) => `  <url><loc>${xmlEscape(origin + encodeURI(p))}</loc></url>\n`).join('')
  + '</urlset>\n'

const sitemapIndex = (files, origin, lastmod) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + files.map((file) =>
    `  <sitemap><loc>${origin}/${file}</loc><lastmod>${lastmod}</lastmod></sitemap>\n`).join('')
  + '</sitemapindex>\n'

/**
 * robots.txt is generated rather than kept in public/, because its Sitemap
 * directive must be an absolute address and a file copied verbatim would carry
 * the old domain through a move.
 */
const robotsTxt = (origin) => `# ${origin}
#
# 학교·아파트 상세는 색인 대상이다. 관리자 화면은 아니다.

User-agent: *
Allow: /
Disallow: /admin/

Sitemap: ${origin}/sitemap.xml
`

const chunk = (items, size) => {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const main = async () => {
  await readEnvFile()
  const origin = siteOrigin()
  const creds = credentials()
  const regions = loadRegions()
  console.log(`origin      ${origin}${siteOriginIsDefault() ? '  (SITE_ORIGIN 미설정 - 기본값)' : '  (SITE_ORIGIN)'}`)
  const shortName = (region) => regions.get(region)?.shortName || region

  const schools = await fetchAll(creds, 'school_master',
    'school_id,school_name,region,road_address,legal_address')

  // The area hubs (api/detail.js): one per 시·도 and one per 시·군·구 that has a
  // school. Sejong has no district level, so it stops at the region.
  const areaPaths = new Set(['/area'])
  for (const row of schools) {
    if (!row.region) continue
    areaPaths.add(`/area/${shortName(row.region)}`)
    const district = districtOf(row.road_address || row.legal_address, regions)
    if (district && !NO_DISTRICTS.has(row.region)) areaPaths.add(`/area/${shortName(row.region)}/${readable([district])}`)
  }

  const schoolPaths = schools
    .filter((row) => row.school_id && row.school_name)
    .map((row) =>
      `/school/${readable([shortName(row.region), districtOf(row.road_address || row.legal_address, regions), row.school_name])}--${row.school_id}`)

  // Serving holds one row per (school, complex), so a complex assigned to two
  // schools appears twice. A sitemap must list each page once.
  const serving = await fetchAll(creds, 'school_apartment_serving',
    'complex_public_key,complex_name,region,district,road_address,school_id')
  const byKey = new Map()
  for (const row of serving) {
    if (!row.complex_public_key) continue
    const entry = byKey.get(row.complex_public_key) || { ...row, schoolIds: new Set() }
    entry.schoolIds.add(row.school_id)
    byKey.set(row.complex_public_key, entry)
  }
  // A complex registered building by building is one page in the sitemap: the
  // representative its other buildings name as canonical (api/detail.js).
  const representatives = new Map()
  for (const row of byKey.values()) {
    const group = buildingGroupKey(row, row.schoolIds) ?? `key:${row.complex_public_key}`
    const current = representatives.get(group)
    if (!current || byBuilding(row, current) < 0) representatives.set(group, row)
  }
  const apartmentPaths = [...representatives.values()].map((row) =>
    `/apt/${readable([shortName(row.region), row.district, row.complex_name])}--${row.complex_public_key}`)
  const groupedAway = byKey.size - representatives.size

  const withoutKey = serving.filter((row) => !row.complex_public_key).length
  const lastmod = new Date().toISOString().slice(0, 10)
  const files = []

  // The home, the guides and the FAQ: the pages written as static HTML by
  // build-shell-pages.mjs. Their own file, so their indexing can be read apart
  // from the detail pages in Search Console.
  const content = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/content/generated/content.json'), 'utf8'))
  const contentPaths = ['/', '/guide', ...content.guides.map((guide) => `/guide/${guide.slug}`), '/faq', '/checklist',
    ...(content.learning ?? []).filter((item) => item.status === 'published').map((item) => `/learn/${item.slug}`)]

  await fs.mkdir(outDir, { recursive: true })
  for (const [label, paths] of [['pages', contentPaths], ['areas', [...areaPaths]], ['schools', schoolPaths], ['apartments', apartmentPaths]]) {
    const pages = chunk(paths, URLS_PER_FILE)
    for (const [index, page] of pages.entries()) {
      const file = `sitemap-${label}-${index + 1}.xml`
      await fs.writeFile(path.join(outDir, file), urlSet(page, origin), 'utf8')
      files.push(file)
    }
    console.log(`${label.padEnd(11)} ${paths.length.toLocaleString()} URLs in ${pages.length} file(s)`)
  }
  console.log(`grouped     ${groupedAway.toLocaleString()} building records left to their complex's representative`)

  await fs.writeFile(path.join(outDir, 'robots.txt'), robotsTxt(origin), 'utf8')
  console.log(`robots      Sitemap -> ${origin}/sitemap.xml`)

  await fs.writeFile(path.join(outDir, 'sitemap.xml'), sitemapIndex(files, origin, lastmod), 'utf8')
  console.log(`index       ${files.length} sitemaps at ${origin}/sitemap.xml`)

  // A complex with no slug has no address, so it cannot be listed. Say so rather
  // than quietly publishing a smaller sitemap than the data would support.
  if (withoutKey) {
    console.warn(`WARNING: ${withoutKey.toLocaleString()} serving rows have no public key `
      + 'and are absent from the sitemap. Run etl/issue_apartment_public_keys.py.')
  }
}

main().catch((error) => {
  console.error(`sitemap generation failed: ${error.message}`)
  process.exitCode = 1
})
