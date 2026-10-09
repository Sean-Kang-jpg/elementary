// A2-R01: grade-1 periods per weekday for the 60 PoC schools, from the NEIS elementary
// timetable. Combined with a school's 시정표 this gives an estimated 하교 time per weekday.
// Read-only public API; raw rows stay in etl/runtime (git-ignored), the summary goes to docs.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { fetchDataset } from './collect-neis-poc.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
// 2026 school year: March adaptation period, a regular first-term stretch, and second term.
export const WINDOWS = [
  { id: 'adaptation_march', from: '20260303', to: '20260327' },
  { id: 'term1_regular', from: '20260406', to: '20260424' },
  { id: 'term2_regular', from: '20260907', to: '20260925' },
  // 추석(9/24-25) falls in term2_regular; an earlier stretch of the term settles days it leaves unclear.
  { id: 'term2_early', from: '20260824', to: '20260904' },
]
// Prior year, same stretches, for measuring how much a school's weekday pattern changes (E04-c3).
export const WINDOWS_2025 = [
  { id: 'term1_regular', from: '20250407', to: '20250425' },
  { id: 'term2_regular', from: '20250908', to: '20250926' },
]

function weekday(ymd) {
  return WEEKDAYS[new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8))).getUTCDay()]
}

// rows -> per weekday: the usual number of periods, how consistently, and the range seen.
export function summarizePeriods(rows) {
  const perDayClass = new Map()
  for (const row of rows) {
    if (String(row.GRADE) !== '1') continue
    const key = `${row.ALL_TI_YMD}|${row.CLASS_NM}`
    if (!perDayClass.has(key)) perDayClass.set(key, new Set())
    perDayClass.get(key).add(Number(row.PERIO))
  }
  const byWeekday = {}
  const classes = new Set(), dates = new Set()
  for (const [key, periods] of perDayClass) {
    const [ymd, cls] = key.split('|')
    classes.add(cls); dates.add(ymd)
    const day = weekday(ymd)
    ;(byWeekday[day] ||= []).push(periods.size)
  }
  const result = {}
  for (const day of ['월', '화', '수', '목', '금']) {
    const counts = byWeekday[day] || []
    if (!counts.length) { result[day] = null; continue }
    const freq = {}
    for (const c of counts) freq[c] = (freq[c] || 0) + 1
    const [mode, hits] = Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    result[day] = { mode: Number(mode), share: Math.round((hits / counts.length) * 100) / 100, min: Math.min(...counts), max: Math.max(...counts), observations: counts.length }
  }
  return { class_count: classes.size, school_days: dates.size, weekdays: result }
}

async function main() {
  const env = { ...dotenv.parse(fs.existsSync(path.join(root, '.env')) ? fs.readFileSync(path.join(root, '.env')) : ''), ...process.env }
  if (!env.NEIS_CLASS_API_KEY) throw Object.assign(new Error('missing_keys'), { safeCode: 'missing_neis_keys' })
  // --manifest=<path>: the pilot expansion manifest carries its own NEIS codes (read from each school's
  // 학교알리미 page and checked 59/59 against the E02 links); --new-only skips schools already in the PoC.
  const manifestArg = process.argv.find(arg => arg.startsWith('--manifest='))?.slice(11)
  const crosswalk = manifestArg
    ? JSON.parse(fs.readFileSync(path.join(root, manifestArg), 'utf8')).schools.map(s => ({ school_id: s.school_id, neis_office_code: s.neis_office_code, neis_school_code: s.neis_school_code }))
    : JSON.parse(fs.readFileSync(path.join(root, 'docs/research/audit2/neis_reconciled_crosswalk_20261006.json'), 'utf8')).crosswalk
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestArg || 'docs/research/audit2/poc_school_manifest_20261006.json'), 'utf8'))
  if (process.argv.includes('--new-only')) manifest.schools = manifest.schools.filter(s => !s.in_poc)
  const ay = process.argv.find(arg => arg.startsWith('--ay='))?.slice(5) || '2026'
  if (!['2025', '2026'].includes(ay)) throw Object.assign(new Error('unsupported_year'), { safeCode: 'unsupported_year' })
  const windows = ay === '2025' ? WINDOWS_2025 : WINDOWS
  const runtime = path.join(root, ay === '2026' ? 'etl/runtime/audit2-neis-grade1' : `etl/runtime/audit2-neis-grade1-${ay}`)
  fs.mkdirSync(runtime, { recursive: true })
  const schools = []
  for (const school of manifest.schools) {
    const link = crosswalk.find(row => row.school_id === school.school_id)
    const record = { school_id: school.school_id, school_name: school.school_name, region: school.region || school.road_address?.split(' ')[0] || null, cohort: school.cohort || school.scope || null, windows: {} }
    if (!link?.neis_school_code) { record.status = 'no_neis_code'; schools.push(record); continue }
    for (const window of windows) {
      const params = { ATPT_OFCDC_SC_CODE: link.neis_office_code, SD_SCHUL_CODE: link.neis_school_code, AY: ay, GRADE: '1', TI_FROM_YMD: window.from, TI_TO_YMD: window.to }
      try {
        const data = await fetchDataset('elsTimetable', env.NEIS_CLASS_API_KEY, params, 5)
        const raw = JSON.stringify(data.rows)
        const digest = crypto.createHash('sha256').update(raw).digest('hex')
        fs.writeFileSync(path.join(runtime, `${school.school_id}_${window.id}.json`), raw)
        record.windows[window.id] = { status: 'ok', total_rows: data.total, rows_sha256: digest, page_hashes: data.pages.map(p => p.response_sha256), ...summarizePeriods(data.rows) }
      } catch (error) {
        record.windows[window.id] = { status: 'request_failed', code: error.safeCode || error.cause?.code || error.name }
      }
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    const statuses = Object.values(record.windows).map(w => w.status)
    record.status = statuses.every(s => s === 'ok') ? 'ok' : statuses.some(s => s === 'ok') ? 'partial' : 'failed'
    schools.push(record)
    console.error(`${school.school_id} ${record.status}`)
  }
  console.log(JSON.stringify({ schema_version: 'neis-grade1-periods-v1', captured_at: new Date().toISOString(), source: `open.neis.go.kr/hub/elsTimetable, AY=${ay} GRADE=1`, academic_year: Number(ay), windows, evidence_state: 'source_reported_2026_not_2027_confirmed', no_operational_upload: true, school_count: schools.length, schools }, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => {
    console.error(JSON.stringify({ status: 'request_failed', code: error.safeCode || error.cause?.code || error.name || 'unknown_error' }))
    process.exitCode = 1
  })
}
