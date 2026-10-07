// A four-post, same-origin public-document pilot. Stores immutable source bytes only.
// Never logs credentials, posts forms, changes the DB, or crawls beyond these posts.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { assertPublicSource, discoverLinks } from './probe-school-document-sources.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const archive = path.join(root, 'etl/runtime/audit2-documents')
const targets = [
  { school_id: 'B000003765', kind: 'afterschool_plan', post_id: '1911782' },
  { school_id: 'B000003765', kind: 'afterschool_plan', post_id: '1952083' },
  { school_id: 'B000003765', kind: 'care_plan', post_id: '1959114' },
  { school_id: 'B000003759', kind: 'afterschool_plan', post_id: '1918506' },
]
export function fileFormat(bytes) {
  if (Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-') return 'pdf'
  if (Buffer.from(bytes.subarray(0, 8)).toString('hex') === 'd0cf11e0a1b11ae1') return 'ole_container_unverified_hwp'
  if (Buffer.from(bytes.subarray(0, 4)).toString('hex') === '504b0304') return 'zip_container_unverified_hwpx'
  if (Buffer.from(bytes.subarray(0, 8)).toString('hex') === '89504e470d0a1a0a') return 'png'
  if (Buffer.from(bytes.subarray(0, 3)).toString('hex') === 'ffd8ff') return 'jpeg'
  return 'unknown'
}
export function discoverDocumentAttachments(html, base) {
  const links = discoverLinks(html, base).filter(link => /\.(pdf|hwp|hwpx)(?:\?|$)/i.test(link.url) || /\.(pdf|hwp|hwpx)\b/i.test(link.title))
  // DEXT5 supplies public filename/path tuples; never execute the page script.
  for (const match of html.matchAll(/DEXT5UPLOAD\.AddUploadedFile\(\s*'[^']*'\s*,\s*'([^']+)'\s*,\s*'([^']+)'/g)) {
    if (!/\.(pdf|hwp|hwpx)$/i.test(match[1])) continue
    const url = new URL(match[2], base)
    if (url.origin !== new URL(base).origin) continue
    links.push({ title: match[1], url: url.href })
  }
  return [...new Map(links.map(link => [link.url, link])).values()].slice(0, 3)
}
// Some notices are a scanned page pasted into the post body, with no attachment at all.
// Only editor-uploaded images inside the post body row count; logos and banners do not.
export function discoverBodyImages(html, base) {
  const body = html.match(/<tr class="cont">([\s\S]*?)<\/tr>/)?.[1] ?? ''
  const images = []
  for (const match of body.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const url = new URL(match[1].replace(/&amp;/g, '&'), base)
    if (url.origin !== new URL(base).origin || !/\/dext5editordata\/.+\.(?:png|jpe?g)$/i.test(url.pathname)) continue
    images.push({ title: match[0].match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || path.basename(url.pathname), url: url.href })
  }
  return [...new Map(images.map(image => [image.url, image])).values()].slice(0, 3)
}
async function getBytes(value, limit) {
  const url = assertPublicSource(value)
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw Object.assign(new Error('http_blocked'), { safeCode: `HTTP-${response.status}` })
  const reader = response.body.getReader(), chunks = []
  let size = 0
  for (;;) {
    const { value: chunk, done } = await reader.read()
    if (done) break
    size += chunk.length
    if (size > limit) { await reader.cancel(); throw Object.assign(new Error('size_limit'), { safeCode: 'size_limit' }) }
    chunks.push(Buffer.from(chunk))
  }
  return { bytes: Buffer.concat(chunks), content_type: response.headers.get('content-type'), http_status: response.status }
}
function storeImmutable(bytes, hash, extension) {
  fs.mkdirSync(archive, { recursive: true })
  const destination = path.join(archive, `${hash}.${extension}`)
  if (fs.existsSync(destination)) {
    if (crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex') !== hash) throw new Error('existing_archive_hash_mismatch')
  } else fs.writeFileSync(destination, bytes, { flag: 'wx' })
  return path.relative(root, destination).replaceAll('\\', '/')
}
async function main() {
  const probe = JSON.parse(fs.readFileSync(path.join(root, 'docs/research/audit2/document_source_probe_20261006.json'), 'utf8'))
  const results = []
  for (const target of targets) {
    const sourceId = `${target.school_id}-${target.kind}`
    const observed = probe.observations.find(o => o.source_id === sourceId)?.observed_links.find(link => new URL(link.url).searchParams.get('nttSn') === target.post_id)
    if (!observed) throw new Error('post_not_in_observed_candidates')
    const record = { ...target, source_id: sourceId, post_url: observed.url, post_title: observed.title, last_checked: new Date().toISOString(), currentness: 'unknown', is_current: null, target_entry_year: 2027, document_academic_year: null, publish_status: 'not_approved', attachments: [] }
    try {
      const html = await getBytes(observed.url, 2_000_000)
      const text = html.bytes.toString('utf8')
      record.post_response_sha256 = crypto.createHash('sha256').update(html.bytes).digest('hex')
      record.post_snapshot_path = storeImmutable(html.bytes, record.post_response_sha256, 'html')
      let attachments = discoverDocumentAttachments(text, observed.url)
      record.status = attachments.length ? 'attachment_links_found' : 'attachment_link_unresolved'
      if (!attachments.length) {
        attachments = discoverBodyImages(text, observed.url)
        if (attachments.length) record.status = 'body_images_found'
      }
      for (const link of attachments) {
        const attachment = { ...link, status: 'not_fetched', currentness: 'unknown', is_current: null, document_academic_year: null, evidence_state: 'not_reviewed' }
        try {
          const source = await getBytes(link.url, 10_000_000)
          const format = fileFormat(source.bytes)
          const hash = crypto.createHash('sha256').update(source.bytes).digest('hex')
          Object.assign(attachment, { status: 'bytes_archived_not_reviewed', bytes: source.bytes.length, content_type: source.content_type, magic_format: format, sha256: hash, version_id: hash, archive_path: storeImmutable(source.bytes, hash, { pdf: 'pdf', png: 'png', jpeg: 'jpg' }[format] ?? 'bin') })
        } catch (error) { attachment.status = 'request_failed'; attachment.code = error.safeCode || error.cause?.code || error.name }
        record.attachments.push(attachment)
      }
    } catch (error) { record.status = 'request_failed'; record.code = error.safeCode || error.cause?.code || error.name }
    results.push(record)
  }
  console.log(JSON.stringify({ schema_version: 'document-pilot-v1', checked_at: new Date().toISOString(), school_count: 2, post_count: targets.length, no_operational_upload: true, results }, null, 2))
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(() => { console.error('document_pilot_failed'); process.exitCode = 1 })
}
