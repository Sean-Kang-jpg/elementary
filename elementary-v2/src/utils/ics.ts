export interface IcsItem {
  id: string
  title: string
  date: string // YYYY-MM-DD, a real calendar date
  url: string
  note?: string
}

export interface IcsOptions {
  /** Supplied by the caller so serialization stays pure and reproducible. */
  generatedAt: Date
  siteOrigin?: string
}

const FALLBACK_ORIGIN = 'https://wherecho.co.kr'
const encoder = new TextEncoder()

const escapeText = (value: string): string => value
  .replace(/\\/g, '\\\\')
  .replace(/\r\n|\r|\n/g, '\\n')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')

/** RFC 5545 §3.1: each physical line, including continuation space, is at most 75 octets. */
const foldLine = (line: string): string => {
  let result = ''
  let bytes = 0
  for (const character of line) {
    const size = encoder.encode(character).length
    if (bytes + size > 75) {
      result += '\r\n '
      bytes = 1
    }
    result += character
    bytes += size
  }
  return result
}

const calendarDate = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    throw new Error('Expected a date in YYYY-MM-DD format')
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Expected a real calendar date')
  }
  return value.replace(/-/g, '')
}

/** All-day events. Relative URLs resolve against the configured public origin, never the current host. */
export const createIcs = (items: readonly IcsItem[], { generatedAt, siteOrigin = FALLBACK_ORIGIN }: IcsOptions): string => {
  const origin = new URL(siteOrigin)
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Expected a public site origin')
  }
  const stamp = generatedAt.toISOString()
  if (!/^\d{4}-/.test(stamp)) throw new Error('Expected a four-digit timestamp year')
  const dtstamp = stamp.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const ids = new Set<string>()
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wherecho//Family Plan//KO', 'CALSCALE:GREGORIAN']
  for (const item of items) {
    if (!item.id.trim() || !item.title.trim() || ids.has(item.id)) {
      throw new Error('Expected a unique ID and a nonempty title')
    }
    ids.add(item.id)
    if (!item.url.trim() || /[\r\n]/.test(item.url)) throw new Error('Expected a site URL')
    const url = new URL(item.url, origin)
    if (url.origin !== origin.origin || url.username || url.password) throw new Error('Expected a same-origin site URL')
    const description = item.note ? `${item.note}\n${url.href}` : url.href
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(item.id)}@wherecho.co.kr`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${calendarDate(item.date)}`,
      'DURATION:P1D',
      `SUMMARY:${escapeText(item.title)}`,
      `URL:${url.href}`,
      `DESCRIPTION:${escapeText(description)}`,
      'END:VEVENT',
    )
  }
  return [...lines, 'END:VCALENDAR'].map(foldLine).join('\r\n') + '\r\n'
}
