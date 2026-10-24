// Fetch a URL without JS and summarise what a crawler sees.
import fs from 'node:fs'
const YETI = 'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)'
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
export const analyze = async (url, ua = YETI) => {
  const t = Date.now()
  const r = await fetch(url, { headers: { 'user-agent': ua }, redirect: 'manual' })
  const html = await r.text()
  const ms = Date.now() - t
  const m = (re) => (html.match(re) || [])[1] ?? null
  const root = m(/<div id="root">([\s\S]*?)<\/div>\s*(?:<script|<noscript|<\/body)/i) ?? ''
  const rootText = strip(html.match(/<div id="root">([\s\S]*)<\/body>/i)?.[1] ?? '')
  const links = [...html.matchAll(/<a\s[^>]*href="([^"]+)"/gi)].map((x) => x[1])
  return {
    url, status: r.status, location: r.headers.get('location'), ms, bytes: Buffer.byteLength(html),
    cache: r.headers.get('x-vercel-cache'), xrobots: r.headers.get('x-robots-tag'),
    title: m(/<title>([\s\S]*?)<\/title>/i), desc: m(/<meta name="description" content="([^"]*)"/i),
    canonical: m(/<link rel="canonical" href="([^"]*)"/i), canonicalCount: (html.match(/rel="canonical"/g) || []).length,
    robots: m(/<meta name="robots" content="([^"]*)"/i), h1: strip(m(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? '') || null,
    h1Count: (html.match(/<h1[\s>]/gi) || []).length, ld: [...html.matchAll(/"@type":"([A-Za-z]+)"/g)].map((x) => x[1]).filter((v, i, a) => a.indexOf(v) === i),
    textLen: rootText.length, links: links.length, internal: links.filter((h) => h.startsWith('/') || h.startsWith('https://wherecho.co.kr')),
    text: rootText,
  }
}
if (process.argv[2]) {
  const out = []
  for (const u of fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)) {
    try { out.push(await analyze(u.trim())) } catch (e) { out.push({ url: u, error: e.message }) }
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1))
}
