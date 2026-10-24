import fs from 'node:fs'
import { analyze } from './analyze.mjs'
const urls = fs.readFileSync('big.txt', 'utf8').split('\n').filter(Boolean)
const out = []; let i = 0
const w = async () => { while (i < urls.length) { const u = urls[i++]; try { const r = await analyze(u); out.push({ url: u, status: r.status, ms: r.ms, cache: r.cache, self: r.canonical === u, canonical: r.canonical, h1: !!r.h1, textLen: r.textLen, title: r.title, zero: /배정 아파트 0곳/.test(r.title || ''), shell: r.textLen === 0 }) } catch (e) { out.push({ url: u, error: e.message }) } } }
await Promise.all([w(), w(), w()])
fs.writeFileSync('big.json', JSON.stringify(out))
for (const t of ['/school/', '/apt/']) {
  const x = out.filter((r) => r.url.includes(t)); const ms = x.map((r) => r.ms).sort((a, b) => a - b)
  const st = {}; for (const r of x) st[r.status ?? 'err'] = (st[r.status ?? 'err'] || 0) + 1
  console.log(t, 'n', x.length, 'status', st, 'selfCanon', x.filter((r) => r.self).length, 'shell(fail-open)', x.filter((r) => r.shell).length, 'noH1', x.filter((r) => !r.h1).length, 'zeroApts', x.filter((r) => r.zero).length,
    'p50', ms[ms.length >> 1], 'p90', ms[Math.floor(ms.length * 0.9)], 'max', ms.at(-1), 'MISS', x.filter((r) => r.cache === 'MISS').length)
  console.log('  non-self canon:', x.filter((r) => !r.self).slice(0, 5).map((r) => decodeURI(r.url) + ' -> ' + decodeURI(r.canonical || 'null')))
}
