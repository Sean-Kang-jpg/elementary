import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync('F:/sm/vibe/elementary/pjt_250826/elementary-v2/.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()]))
const url = env.VITE_SUPABASE_URL.replace(/\/$/, ''), key = env.VITE_SUPABASE_ANON_KEY
const all = async (table, select, order) => {
  const rows = []
  for (let o = 0; ; o += 1000) {
    const r = await fetch(`${url}/rest/v1/${table}?select=${select}&order=${order}&limit=1000&offset=${o}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    const p = await r.json(); rows.push(...p); if (p.length < 1000) break
  }
  return rows
}
fs.writeFileSync('schools.json', JSON.stringify(await all('school_master', 'school_id,school_name,region,establishment_type,grade1_students,total_students', 'school_id')))
fs.writeFileSync('serving.json', JSON.stringify(await all('school_apartment_serving', 'school_id,canonical_complex_id,complex_public_key,complex_name,region,district,road_address,households,assignment_rank', 'school_id,canonical_complex_id')))
console.log('ok')
