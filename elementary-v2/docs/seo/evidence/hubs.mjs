import fs from 'node:fs'
import { analyze } from './analyze.mjs'
const urls = fs.readFileSync('sitemap-areas-1.xml', 'utf8').match(/<loc>[^<]+/g).map((s) => s.slice(5))
const out = []
let i = 0
const worker = async () => { while (i < urls.length) { const u = urls[i++]; try { const r = await analyze(u); delete r.text; out.push(r) } catch (e) { out.push({ url: u, error: e.message }) } } }
await Promise.all([worker(), worker(), worker()])
fs.writeFileSync('hubs.json', JSON.stringify(out))
const st = {}; for (const r of out) st[r.status ?? 'err'] = (st[r.status ?? 'err'] || 0) + 1
const ms = out.map((r) => r.ms).filter(Boolean).sort((a, b) => a - b)
console.log('status', st, 'p50', ms[ms.length >> 1], 'p90', ms[Math.floor(ms.length * 0.9)], 'max', ms.at(-1))
console.log('canon mismatch', out.filter((r) => r.canonical && r.canonical !== r.url).map((r) => decodeURI(r.url)).slice(0, 10))
