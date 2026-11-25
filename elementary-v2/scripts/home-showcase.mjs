/** Fetch the representative school's published afternoon data once at build time. */

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
    const [schools, days, hours, summary] = await Promise.all([
      get('school_master', { select: 'school_id,school_name', school_id: id }),
      get('school_day_estimate_weekdays', { select: 'weekday,dismissal', school_id: id, order: 'weekday' }),
      get('school_care_hours', { select: 'status,afternoon_end', school_id: id }),
      get('school_afterschool_summary', { select: LATEST.join(','), school_id: id }),
    ])
    const school = schools[0]
    if (!school || !days.some((row) => clock(row.dismissal))) return null
    const hoursRow = hours[0]
    const latest = summary[0]
    return {
      generatedAt: new Date().toISOString().slice(0, 10),
      school: {
        id: school.school_id,
        name: school.school_name,
        careEnd: hoursRow?.status === 'stated' ? clock(hoursRow.afternoon_end) : null,
        days: DAYS.map((label, index) => ({
          label,
          dismissal: clock(days.find((row) => row.weekday === index + 1)?.dismissal),
          afterschoolEnd: latest ? clock(latest[LATEST[index]]) : null,
        })),
      },
    }
  } catch (error) {
    process.stdout.write(`showcase    skipped (${error.message})\n`)
    return null
  }
}
