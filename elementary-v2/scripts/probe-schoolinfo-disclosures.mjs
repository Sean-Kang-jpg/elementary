// Central-source survey: which PoC schools publish their curriculum plan (2-가) and
// afterschool/care plan (15-라) as 학교알리미 attachments. Metadata only — the item
// pages are public GETs; no file download, login, form POST, or DB write.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = 'https://www.schoolinfo.go.kr'
// Parameters exactly as the school page's own loadGongSi() call sends them.
export const ITEMS = {
  curriculum: { url: '/ei/pp/Pneipp_b14_s0p.do', GS_HANGMOK_CD: '14', GS_HANGMOK_NO: '2-가', GS_HANGMOK_NM: '학교교육과정 편성ㆍ운영 및 평가에 관한 사항', GS_BURYU_CD: 'JG100', JG_BURYU_CD: 'JG020', JG_HANGMOK_CD: '05', JG_GUBUN: '1' },
  afterschool: { url: '/ei/pp/Pneipp_b73_s0p.do', GS_HANGMOK_CD: '73', GS_HANGMOK_NO: '15-라', GS_HANGMOK_NM: '방과후학교 운영 계획 및 운영ㆍ지원현황', GS_BURYU_CD: 'JG130', JG_BURYU_CD: 'JG150', JG_HANGMOK_CD: '59', JG_GUBUN: '1' },
}

export function itemUrl(item, shlIdfCd, schoolName, year) {
  const { url, ...codes } = ITEMS[item]
  const query = new URLSearchParams({ ...codes, JG_YEAR2: year, HG_NM: schoolName, SHL_IDF_CD: shlIdfCd, GS_TYPE: 'Y', JG_YEAR: year, SORT: 'BR', CHOSEN_JG_YEAR: year, PRE_JG_YEAR: year, LOAD_TYPE: 'single' })
  return `${ORIGIN}${url}?${query}`
}

export function parseDisclosure(html) {
  const periods = [...html.matchAll(/\((\d)차\)\s*(\d{4})년\s*(\d{2})월/g)].map(m => ({ round: Number(m[1]), year: Number(m[2]), month: Number(m[3]) }))
  const attachments = []
  for (const m of html.matchAll(/<a\b[^>]*class="file_name"[^>]*onclick="getEiFile\d+\('(\d+)'[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
    const label = m[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
    const parsed = label.match(/^(.*?)\(([\d,.]+\s*[KMG]?B)\)$/)
    attachments.push({ file_seq: m[1], name: parsed ? parsed[1].trim() : label, size: parsed ? parsed[2] : null })
  }
  const asOf = html.match(/\[(\d{4})\.(\d{1,2})\.(\d{1,2})\s*기준\]/)
  return { periods, attachments, status_as_of: asOf ? `${asOf[1]}-${asOf[2].padStart(2, '0')}-${asOf[3].padStart(2, '0')}` : null }
}

// Which academic year a file says it is for, from its own name only.
export function fileAcademicYear(name) {
  const m = name.match(/(20\d{2})\s*학년도/) || name.match(/(20\d{2})/)
  return m ? Number(m[1]) : null
}

export function classifyFile(name) {
  if (/방과후|돌봄|늘봄|온돌봄/.test(name)) return 'afterschool_care_plan'
  if (/학사\s*일정/.test(name)) return 'academic_calendar'
  if (/교육과정|교육계획/.test(name)) return 'curriculum_plan'
  return 'other'
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'x-requested-with': 'XMLHttpRequest' }, redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  const bytes = Buffer.from(await response.arrayBuffer())
  let text = bytes.toString('utf8')
  if (text.includes('�')) text = new TextDecoder('euc-kr').decode(bytes)
  return { status: response.status, text }
}

function schoolinfoIndex() {
  const dir = path.join(root, 'etl/local_outputs_20260320')
  const index = new Map()
  for (const file of fs.readdirSync(dir).filter(f => /^schoolinfo_2026_basic_.*\.json$/.test(f))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const rows = Array.isArray(data) ? data : Object.values(data).find(Array.isArray) || []
    for (const row of rows) if (row.SCHUL_CODE && row.SHL_IDF_CD) index.set(row.SCHUL_CODE, row.SHL_IDF_CD)
  }
  return index
}

async function main() {
  const year = process.argv[2] || '2026'
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/research/audit2/poc_school_manifest_20261006.json'), 'utf8'))
  const index = schoolinfoIndex()
  const schools = []
  for (const school of manifest.schools) {
    const shl = index.get(school.schoolinfo_code)
    const record = { school_id: school.school_id, school_name: school.school_name, region: school.region, cohort: school.cohort, shl_idf_cd: shl ?? null, items: {} }
    for (const item of Object.keys(ITEMS)) {
      if (!shl) { record.items[item] = { status: 'no_schoolinfo_id' }; continue }
      const checkedAt = new Date().toISOString()
      try {
        const { status, text } = await fetchText(itemUrl(item, shl, school.school_name, year))
        const parsed = parseDisclosure(text)
        record.items[item] = {
          status: status !== 200 ? `http_${status}` : parsed.attachments.length ? 'attachments_listed' : 'no_attachment',
          checked_at: checkedAt,
          http_status: status,
          latest_period: parsed.periods[0] ?? null,
          status_as_of: parsed.status_as_of,
          attachments: parsed.attachments.map(a => ({ ...a, file_academic_year: fileAcademicYear(a.name), kind: classifyFile(a.name) })),
        }
      } catch (error) {
        record.items[item] = { status: 'request_failed', checked_at: checkedAt, code: error.cause?.code || error.name }
      }
      await new Promise(resolve => setTimeout(resolve, 800))
    }
    schools.push(record)
  }
  console.log(JSON.stringify({ schema_version: 'schoolinfo-disclosure-probe-v1', checked_at: new Date().toISOString(), disclosure_year: Number(year), school_count: schools.length, files_downloaded: false, no_operational_upload: true, schools }, null, 2))
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(() => { console.error('schoolinfo_disclosure_probe_failed'); process.exitCode = 1 })
}
