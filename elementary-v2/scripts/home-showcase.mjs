/**
 * The home's "어디초로 볼 수 있는 것" row: real values for one school and its
 * largest assigned complex, read once at build time (2026-10-15 decision: a
 * fixed snapshot, not a live read on every home visit).
 *
 * build-shell-pages.mjs calls loadShowcase(), writes dist/home-showcase.json for
 * the app and puts the same values in the static home. A failed read returns
 * null and the row is left out - the home must build without Supabase.
 *
 * Paths mirror build-seo-files.mjs (districtOf, readable) so the links are the
 * canonical spelling and do not redirect.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DAYS = ['월', '화', '수', '목', '금']
const LATEST = ['latest_end_mon', 'latest_end_tue', 'latest_end_wed', 'latest_end_thu', 'latest_end_fri']

const readEnvFile = async () => {
  try {
    const text = await fs.readFile(path.join(projectRoot, '.env'), 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const [key, ...rest] = trimmed.split('=')
      if (!process.env[key]) process.env[key] = rest.join('=').trim()
    }
  } catch {
    // Vercel supplies the variables directly.
  }
}

/** Region short names and city levels from the generated registry (as build-seo-files.mjs). */
const loadRegions = async () => {
  const source = await fs.readFile(path.join(projectRoot, 'src/constants/regionRegistry.ts'), 'utf8')
  const regions = new Map()
  let canonicalName = null
  let shortName = null
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
  return regions
}

const districtOf = (address, regions) => {
  const parts = String(address || '').trim().split(/\s+/)
  const hasCityLevel = regions.get(parts[0] || '')?.hasCityLevel ?? false
  if (!hasCityLevel) return parts[1] || ''
  const subDistrict = /구$/.test(parts[2] || '') ? parts[2] : ''
  return [parts[1] || '', subDistrict].filter(Boolean).join(' ')
}

const readable = (parts) =>
  parts
    .filter((part) => part && String(part).trim())
    .join('-')
    .replace(/[\\/?#%&+\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

const clock = (value) => (/^\d{2}:\d{2}/.test(String(value || '')) ? String(value).slice(0, 5) : null)

export const loadShowcase = async (schoolId) => {
  await readEnvFile()
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key || !schoolId) return null
  const get = async (table, params) => {
    const response = await fetch(`${url}/rest/v1/${table}?${new URLSearchParams(params)}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`${table} -> ${response.status}`)
    return response.json()
  }
  try {
    const id = `eq.${schoolId}`
    const [schools, days, hours, summary, serving, regions] = await Promise.all([
      get('school_master', { select: 'school_id,school_name,region,road_address,legal_address,grade1_students,grade1_per_class', school_id: id }),
      get('school_day_estimate_weekdays', { select: 'weekday,dismissal', school_id: id, order: 'weekday' }),
      get('school_care_hours', { select: 'status,morning_hours,afternoon_end', school_id: id }),
      get('school_afterschool_summary', { select: `grade1_options,custom_options,${LATEST.join(',')}`, school_id: id }),
      get('school_apartment_serving', { select: 'canonical_complex_id,complex_name,households,complex_public_key,region,district', school_id: id, limit: '500' }),
      loadRegions(),
    ])
    const school = schools[0]
    if (!school) return null
    const shortName = regions.get(school.region)?.shortName ?? school.region
    const district = districtOf(school.road_address || school.legal_address, regions)
    const hoursRow = hours[0]
    const morning = String(hoursRow?.morning_hours || '').match(/^\s*(\d{1,2}):(\d{2})\s*[~∼\-–]\s*(\d{1,2}):(\d{2})\s*$/)
    const latest = summary[0]
    const complexes = new Map()
    for (const row of serving) if (!complexes.has(row.canonical_complex_id)) complexes.set(row.canonical_complex_id, row)
    const biggest = [...complexes.values()]
      .filter((row) => row.complex_public_key)
      .sort((a, b) => (Number(b.households) || 0) - (Number(a.households) || 0))[0]
    return {
      generatedAt: new Date().toISOString().slice(0, 10),
      school: {
        id: school.school_id,
        name: school.school_name,
        place: `${shortName} ${district}`.trim(),
        path: `/school/${readable([shortName, district, school.school_name])}--${school.school_id}`,
        grade1Students: Number(school.grade1_students) || null,
        grade1PerClass: Number(school.grade1_per_class) || null,
        apartments: complexes.size,
        morning: morning ? `${morning[1].padStart(2, '0')}:${morning[2]}~${morning[3].padStart(2, '0')}:${morning[4]}` : null,
        careEnd: hoursRow?.status === 'stated' ? clock(hoursRow.afternoon_end) : null,
        grade1Options: latest ? Number(latest.grade1_options) : null,
        customOptions: latest ? Number(latest.custom_options) : null,
        days: DAYS.map((label, index) => ({
          label,
          dismissal: clock(days.find((row) => row.weekday === index + 1)?.dismissal),
          afterschoolEnd: latest ? clock(latest[LATEST[index]]) : null,
        })),
      },
      apartment: biggest
        ? {
            name: biggest.complex_name,
            path: `/apt/${readable([regions.get(biggest.region)?.shortName ?? biggest.region, biggest.district, biggest.complex_name])}--${biggest.complex_public_key}`,
            households: Number(biggest.households) || null,
          }
        : null,
    }
  } catch (error) {
    process.stdout.write(`showcase    skipped (${error.message})\n`)
    return null
  }
}
