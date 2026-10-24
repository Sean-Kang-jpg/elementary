import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync('F:/sm/vibe/elementary/pjt_250826/elementary-v2/.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()]))
process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL; process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const { createRequire } = await import('node:module'); const require = createRequire(import.meta.url)
const { readable, districtFromAddress } = require('F:/sm/vibe/elementary/pjt_250826/api/detail.js').__test
const short = { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주' }
const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/school_master?select=school_id,school_name,region,road_address,legal_address&limit=10000`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } })
let rows = await r.json()
if (rows.length < 6302) { rows = []; for (let o = 0; o < 7000; o += 1000) { const p = await (await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/school_master?select=school_id,school_name,region,road_address,legal_address&order=school_id&limit=1000&offset=${o}`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } })).json(); rows.push(...p) } }
const sm = new Map(fs.readFileSync('all_urls.txt', 'utf8').split('\n').filter((u) => u.includes('/school/')).map((u) => [decodeURI(u).split('--').pop(), decodeURI(u).replace('https://wherecho.co.kr', '')]))
let mismatch = []
for (const s of rows) { const c = `/school/${readable([short[s.region], districtFromAddress(s.road_address || s.legal_address, s.region), s.school_name])}--${s.school_id}`; if (sm.get(s.school_id) !== c) mismatch.push([sm.get(s.school_id), c]) }
console.log('schools checked', rows.length, 'sitemap≠canonical', mismatch.length, mismatch.slice(0, 5))
