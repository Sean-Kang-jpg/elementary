// Bounded read-only NEIS PoC. Prints sanitized public-school results to stdout.
// No Supabase writes, no file writes, no credentials/credential-bearing URLs.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nameIdentity = value => String(value || '').normalize('NFC').replace(/\s/g, '')
export const addressIdentity = value => String(value || '').normalize('NFC').replace(/\([^)]*\)/g, '').replace(/[\s,]/g, '')
const keep = (row, fields) => Object.fromEntries(fields.filter(field => field in row).map(field => [field, row[field]]))
const SCHOOL_FIELDS = ['ATPT_OFCDC_SC_CODE', 'SD_SCHUL_CODE', 'SCHUL_NM', 'SCHUL_KND_SC_NM', 'ORG_RDNMA', 'JU_ORG_NM', 'HMPG_ADRES']
const TIME_FIELDS = ['ATPT_OFCDC_SC_CODE', 'SD_SCHUL_CODE', 'SCHUL_NM', 'AY', 'SEM', 'ALL_TI_YMD', 'GRADE', 'CLASS_NM', 'PERIO', 'ITRT_CNTNT', 'LOAD_DTM']
const CAL_FIELDS = ['ATPT_OFCDC_SC_CODE', 'SD_SCHUL_CODE', 'SCHUL_NM', 'AY', 'AA_YMD', 'EVENT_NM', 'EVENT_CNTNT', 'SBTR_DD_SC_NM', 'ONE_GRADE_EVENT_YN', 'LOAD_DTM']

export function parsePage(payload, endpoint) {
  if (payload.RESULT) {
    if (payload.RESULT.CODE === 'INFO-200') return { rows: [], total: 0, code: 'INFO-200' }
    throw Object.assign(new Error('api_error'), { safeCode: String(payload.RESULT.CODE || 'unknown_api_code') })
  }
  const blocks = payload[endpoint]
  if (!Array.isArray(blocks)) throw Object.assign(new Error('invalid_payload'), { safeCode: 'invalid_payload' })
  const head = blocks.flatMap(block => block.head || [])
  const result = head.find(item => item.RESULT)?.RESULT
  if (result?.CODE !== 'INFO-000') throw Object.assign(new Error('api_error'), { safeCode: result?.CODE || 'missing_result' })
  const rows = blocks.flatMap(block => block.row || [])
  const total = Number(head.find(item => item.list_total_count !== undefined)?.list_total_count)
  if (!Number.isInteger(total) || total < rows.length) throw Object.assign(new Error('invalid_count'), { safeCode: 'invalid_count' })
  return { rows, total, code: result.CODE }
}

export function matchSchool(school, rows) {
  const candidates = rows.filter(row => row.ATPT_OFCDC_SC_CODE === school.neis_office_code && row.SCHUL_KND_SC_NM === '초등학교' && nameIdentity(row.SCHUL_NM) === nameIdentity(school.school_name))
  const matches = candidates.filter(row => addressIdentity(school.road_address) && addressIdentity(row.ORG_RDNMA) === addressIdentity(school.road_address))
  const byCode = new Map(matches.map(row => [row.SD_SCHUL_CODE, row]))
  const exact = byCode.size === 1 ? [...byCode.values()][0] : null
  const accepted = exact && /^\d{7}$/.test(exact.SD_SCHUL_CODE) ? exact : null
  return {
    school_id: school.school_id,
    schoolinfo_code: school.schoolinfo_code,
    school_name: school.school_name,
    neis_office_code: school.neis_office_code,
    status: accepted ? 'verified_exact_name_address' : exact ? 'hold_invalid_code' : byCode.size > 1 ? 'hold_ambiguous' : candidates.length ? 'hold_address_mismatch' : 'hold_no_name_match',
    neis_school_code: accepted?.SD_SCHUL_CODE || null,
    rule: 'same office + primary school + exact NFC/whitespace-normalized name + road-address identity (parenthetical/commas/spaces removed; hyphens/digits preserved) + seven-digit NEIS code',
    candidates: candidates.map(row => keep(row, SCHOOL_FIELDS)),
  }
}

export async function fetchDataset(endpoint, key, params, maxPages = 5) {
  if (!['schoolInfo', 'elsTimetable', 'SchoolSchedule'].includes(endpoint)) throw new Error('unsupported_endpoint')
  const rows = [], pages = []
  let total = null
  for (let page = 1; page <= maxPages; page += 1) {
    const query = new URLSearchParams({ ...params, KEY: key, Type: 'json', pIndex: String(page), pSize: '1000' })
    const response = await fetch(`https://open.neis.go.kr/hub/${endpoint}?${query}`, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw Object.assign(new Error('http_error'), { safeCode: `HTTP-${response.status}` })
    const raw = await response.text()
    const parsed = parsePage(JSON.parse(raw), endpoint)
    total = parsed.total
    rows.push(...parsed.rows)
    pages.push({ page, row_count: parsed.rows.length, total, code: parsed.code, response_sha256: crypto.createHash('sha256').update(raw).digest('hex') })
    if (rows.length >= total) break
    if (!parsed.rows.length) throw Object.assign(new Error('incomplete_page'), { safeCode: 'incomplete_page' })
  }
  if (rows.length !== total) throw Object.assign(new Error('incomplete_dataset'), { safeCode: 'incomplete_dataset' })
  return { endpoint: `https://open.neis.go.kr/hub/${endpoint}`, params, pages, total, rows }
}

async function main() {
  const env = dotenv.parse(fs.readFileSync(path.join(root, '.env')))
  if (!env.NEIS_SCHOOL_API_KEY || !env.NEIS_CLASS_API_KEY) throw Object.assign(new Error('missing_keys'), { safeCode: 'missing_neis_keys' })
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/research/audit2/poc_school_manifest_20261006.json'), 'utf8'))
  const evidence = [], all = []
  const reconciledMode = process.argv.includes('--reconciled-samples')
  let crosswalk
  if (reconciledMode) {
    const verified = JSON.parse(fs.readFileSync(path.join(root, 'docs/research/audit2/neis_reconciled_crosswalk_20261006.json'), 'utf8'))
    if (verified.denominator !== manifest.denominator || verified.crosswalk.length !== manifest.schools.length || new Set(verified.crosswalk.map(row => row.school_id)).size !== manifest.schools.length) throw new Error('invalid_reconciled_population')
    for (const row of verified.crosswalk) {
      const school = manifest.schools.find(school => school.school_id === row.school_id)
      if (!school || row.neis_school_code && (row.status !== 'verified_etl_schoolinfo_address' || !/^\d{7}$/.test(row.neis_school_code) || row.neis_office_code !== school.neis_office_code)) throw new Error('invalid_reconciled_identity')
    }
    crosswalk = verified.crosswalk
  }
  for (const office of reconciledMode ? [] : [...new Set(manifest.schools.map(school => school.neis_office_code))].sort()) {
    const data = await fetchDataset('schoolInfo', env.NEIS_SCHOOL_API_KEY, { ATPT_OFCDC_SC_CODE: office, SCHUL_KND_SC_NM: '초등학교' })
    all.push(...data.rows)
    evidence.push({ ...data, rows: undefined })
    console.error(`schoolInfo ${office}: ${data.total} rows`)
  }
  crosswalk ||= manifest.schools.map(school => matchSchool(school, all))
  const samples = []
  for (const stratum of Object.keys(manifest.strata)) {
    const school = manifest.schools.find(school => school.stratum === stratum && crosswalk.find(row => row.school_id === school.school_id)?.neis_school_code)
    if (!school) continue
    const match = crosswalk.find(row => row.school_id === school.school_id)
    const base = { ATPT_OFCDC_SC_CODE: match.neis_office_code, SD_SCHUL_CODE: match.neis_school_code }
    for (const endpoint of ['elsTimetable', 'SchoolSchedule']) {
      const params = endpoint === 'elsTimetable' ? { ...base, AY: '2026', GRADE: '1', TI_FROM_YMD: '20260914', TI_TO_YMD: '20260918' } : { ...base, AA_FROM_YMD: '20260901', AA_TO_YMD: '20261031' }
      try {
        const data = await fetchDataset(endpoint, env.NEIS_CLASS_API_KEY, params, 2)
        samples.push({ school_id: school.school_id, stratum, ...data, rows: data.rows.slice(0, 12).map(row => keep(row, endpoint === 'elsTimetable' ? TIME_FIELDS : CAL_FIELDS)), captured_sample_rows: Math.min(12, data.total), sample_is_truncated: data.total > 12, start_time: null, end_time: null, absolute_clock_source: 'not_collected', evidence_state: 'source_reported_2026_not_2027_confirmed' })
        console.error(`${endpoint} ${stratum}: ${data.total} rows`)
      } catch (error) {
        samples.push({ school_id: school.school_id, stratum, endpoint: `https://open.neis.go.kr/hub/${endpoint}`, params, status: 'request_failed', code: error.safeCode || error.cause?.code || error.name || 'unknown_error', rows: [], start_time: null, end_time: null })
        console.error(`${endpoint} ${stratum}: request failed`)
      }
    }
  }
  console.log(JSON.stringify({ captured_at: new Date().toISOString(), denominator: manifest.denominator, rule_version: reconciledMode ? 'existing-etl-schoolinfo-v2' : 'exact-name-road-v1', crosswalk_source: reconciledMode ? 'neis_reconciled_crosswalk_20261006.json' : 'live_schoolInfo', no_operational_upload: true, school_info_pages: evidence, crosswalk, samples }, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => {
    console.error(JSON.stringify({ status: 'request_failed', code: error.safeCode || error.cause?.code || error.name || 'unknown_error' }))
    process.exitCode = 1
  })
}
