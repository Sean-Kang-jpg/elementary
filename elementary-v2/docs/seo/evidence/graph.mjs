// Model the internal-link graph from the hub crawl (real HTML) plus the link rules in api/detail.js.
import fs from 'node:fs'
const hubs = JSON.parse(fs.readFileSync('hubs.json'))
const schools = JSON.parse(fs.readFileSync('schools.json'))
const serving = JSON.parse(fs.readFileSync('serving.json'))
const keyOf = (href) => decodeURI(href).split('--').pop()
const sitemapApt = new Set(fs.readFileSync('all_urls.txt', 'utf8').split('\n').filter((u) => u.includes('/apt/')).map(keyOf))
const sitemapSchool = new Set(fs.readFileSync('all_urls.txt', 'utf8').split('\n').filter((u) => u.includes('/school/')).map(keyOf))
const n = (v) => (v == null || v === '' ? 0 : Number(v))
const base = (a) => String(a || '').trim().replace(/(\d+)-\d+$/, '$1')
const sub = (a) => { const m = String(a || '').trim().match(/\d+-(\d+)$/); return m ? Number(m[1]) : 0 }
const byB = (a, b) => sub(a.road_address) - sub(b.road_address) || String(a.complex_public_key).localeCompare(String(b.complex_public_key))
const collapse = (rows) => { const g = new Map(); for (const r of rows) { const id = r.road_address ? [r.region, r.district, r.complex_name, base(r.road_address)].join('|') : `key:${r.complex_public_key || r.canonical_complex_id}`; const x = g.get(id); if (!x) { g.set(id, { ...r, buildings: 1 }); continue } x.households = n(x.households) + n(r.households); if (byB(r, x) < 0) Object.assign(x, { complex_public_key: r.complex_public_key, road_address: r.road_address }) } return [...g.values()] }

const bySchool = new Map()
for (const r of serving) { if (!bySchool.has(r.school_id)) bySchool.set(r.school_id, []); bySchool.get(r.school_id).push(r) }

// Depth from hubs: /area=1, region=2, district=3, so targets linked from district pages are depth 4.
const depth = new Map() // node -> depth; nodes 's:ID' / 'a:KEY'
const set = (k, d) => { if (!depth.has(k) || depth.get(k) > d) { depth.set(k, d); return true } return false }
for (const h of hubs) {
  const segs = decodeURI(h.url).replace('https://wherecho.co.kr/area', '').split('/').filter(Boolean).length
  const d = segs + 2 // children of /area (segs 0) are depth 2
  for (const href of h.internal || []) {
    if (href.startsWith('/school/')) set('s:' + keyOf(href), d)
    if (href.startsWith('/apt/')) set('a:' + keyOf(href), d)
  }
}
const fromHubs = { s: [...depth.keys()].filter((k) => k[0] === 's').length, a: [...depth.keys()].filter((k) => k[0] === 'a').length }

// Edges from detail pages (rules mirrored from api/detail.js)
const edges = new Map()
const add = (from, to) => { if (!edges.has(from)) edges.set(from, new Set()); edges.get(from).add(to) }
for (const [sid, rows] of bySchool) {
  const uniq = new Map(); for (const r of rows) if (!uniq.has(r.canonical_complex_id)) uniq.set(r.canonical_complex_id, r)
  collapse([...uniq.values()]).filter((r) => r.complex_public_key).sort((a, b) => n(b.households) - n(a.households)).slice(0, 60).forEach((r) => add('s:' + sid, 'a:' + r.complex_public_key))
}
const aptRows = new Map(); for (const r of serving) { if (!r.complex_public_key) continue; if (!aptRows.has(r.complex_public_key)) aptRows.set(r.complex_public_key, []); aptRows.get(r.complex_public_key).push(r) }
for (const [k, rows] of aptRows) {
  rows.sort((a, b) => n(a.assignment_rank) - n(b.assignment_rank))
  for (const r of rows) add('a:' + k, 's:' + r.school_id)
  const primary = rows[0].school_id
  const top = (bySchool.get(primary) || []).slice().sort((a, b) => n(b.households) - n(a.households)).slice(0, 60)
  let c = 0; for (const r of collapse(top)) { if (!r.complex_public_key || r.complex_public_key === k) continue; add('a:' + k, 'a:' + r.complex_public_key); if (++c === 10) break }
}
// BFS from hub-linked nodes
let frontier = [...depth.keys()]
while (frontier.length) { const next = []; for (const f of frontier) for (const t of edges.get(f) || []) if (set(t, depth.get(f) + 1)) next.push(t); frontier = next }

const hist = (prefix, universe) => { const h = {}; let orphan = 0; for (const k of universe) { const d = depth.get(prefix + k); if (d == null) orphan++; else h[d] = (h[d] || 0) + 1 } return { h, orphan, total: universe.size } }
// in-degree for apartments
const indeg = new Map(); for (const [, ts] of edges) for (const t of ts) indeg.set(t, (indeg.get(t) || 0) + 1)
for (const h of hubs) for (const href of h.internal || []) if (href.startsWith('/apt/')) indeg.set('a:' + keyOf(href), (indeg.get('a:' + keyOf(href)) || 0) + 1)
const aptIn = [...sitemapApt].map((k) => indeg.get('a:' + k) || 0)
const zeroIn = aptIn.filter((x) => x === 0).length
const zeroSchool = schools.filter((s) => !(bySchool.get(s.school_id) || []).length)
const est = {}; for (const s of zeroSchool) est[s.establishment_type] = (est[s.establishment_type] || 0) + 1
console.log(JSON.stringify({ fromHubs, schools: hist('s:', sitemapSchool), apartments: hist('a:', sitemapApt), aptZeroInlinks: zeroIn,
  aptIn1: aptIn.filter((x) => x === 1).length, schoolsWithZeroApts: zeroSchool.length, zeroByType: est,
  schoolsTotalByType: schools.reduce((m, s) => (m[s.establishment_type] = (m[s.establishment_type] || 0) + 1, m), {}),
  servingRowsNoKey: serving.filter((r) => !r.complex_public_key).length, servingRows: serving.length }, null, 1))
// Check the modelled detail-page edges against the real HTML of the sampled pages.
const sample = JSON.parse(fs.readFileSync('sample.json'))
let pages = 0, exact = 0, missingInModel = 0, extraInModel = 0
for (const p of sample) {
  const path = decodeURI(p.url)
  const isS = path.includes('/school/'), isA = path.includes('/apt/')
  if (!isS && !isA) continue
  pages++
  const node = (isS ? 's:' : 'a:') + keyOf(p.url)
  const real = new Set(p.internal.filter((h) => /^\/(apt|school)\//.test(h)).map((h) => (h.startsWith('/apt/') ? 'a:' : 's:') + keyOf(h)))
  real.delete(node)
  const model = new Set([...(edges.get(node) || [])])
  if (isS) for (const r of real) if (r[0] === 's') model.add(r) // nearby schools are geometric, not modelled
  const miss = [...real].filter((x) => !model.has(x)).length, extra = [...model].filter((x) => !real.has(x)).length
  missingInModel += miss; extraInModel += extra; if (!miss && !extra) exact++
}
console.log('edge check', { pages, exact, missingInModel, extraInModel })
