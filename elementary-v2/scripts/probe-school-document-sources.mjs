// Bounded public HTML discovery only. No login, downloads, database or file writes.
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const allowedHosts = new Set(['hs-e.goesn.kr', 'yy-e.goesn.kr'])
export function assertPublicSource(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.username || url.password) throw new Error('source_not_allowlisted')
  return url
}
export function discoverLinks(html, base) {
  const links = []
  // Only resolve JS post buttons when the response itself supplies the action.
  const actions = [...html.matchAll(/attr\(["']action["'],\s*["']([^"']*selectNttInfo\.do\?[^"']*nttSn=)["']\s*\+\s*nttSn/g)].map(match => match[1])
  const postAction = actions.find(action => !action.includes('clasHmpgId='))
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    let href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    const postId = match[1].match(/\bdata-id\s*=\s*["'](\d+)["']/i)?.[1]
    if (postAction && postId && /\bnttInfoBtn\b/.test(match[1])) href = postAction + postId
    if (!href || /^(?:javascript:|#)/i.test(href)) continue
    const title = match[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const url = new URL(href.replace(/&amp;/g, '&'), base)
    if (url.origin !== new URL(base).origin || !/(?:selectNttInfo|fileDown|download|\.(?:pdf|hwp|hwpx)(?:\?|$))/i.test(url.href)) continue
    if (!title || title.length > 250) continue
    links.push({ url: url.href, title })
  }
  return [...new Map(links.map(link => [link.url, link])).values()].slice(0, 20)
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(path.join(root, 'docs/research/audit2/document_source_registry_20261006.json'), 'utf8'))
  const observations = []
  for (const source of seed.sources.filter(s => s.source_url).slice(0, 3)) {
    const checkedAt = new Date().toISOString()
    try {
      const url = assertPublicSource(source.source_url)
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
      const contentType = response.headers.get('content-type') || ''
      if (!response.ok || !contentType.includes('text/html')) {
        observations.push({ source_id: source.source_id, last_checked: checkedAt, status: 'access_or_content_blocked', http_status: response.status, content_type: contentType, currentness: 'unknown' })
        continue
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > 2_000_000) throw new Error('response_size_limit')
      const html = new TextDecoder().decode(bytes)
      observations.push({ source_id: source.source_id, last_checked: checkedAt, status: 'html_received_attachment_not_fetched', http_status: response.status, content_type: contentType, bytes: bytes.length, board_response_sha256: crypto.createHash('sha256').update(bytes).digest('hex'), observed_links: discoverLinks(html, url.href), currentness: 'unknown', document_sha256: null, document_format: null })
    } catch (error) {
      observations.push({ source_id: source.source_id, last_checked: checkedAt, status: 'request_failed', code: error.cause?.code || error.name, currentness: 'unknown' })
    }
  }
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), scope: 'two_development_schools_only', no_operational_upload: true, observations }, null, 2))
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(() => { console.error('public_document_probe_failed'); process.exitCode = 1 })
}
