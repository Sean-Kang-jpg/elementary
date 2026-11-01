import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createIcs, type IcsItem } from './ics.ts'

const generatedAt = new Date('2026-11-01T02:03:04.567Z')
const options = { generatedAt }
const item: IcsItem = { id: 'admission', title: '입학 준비', date: '2027-03-02', url: '/guide/admission-timeline' }
const unfold = (value: string) => value.replace(/\r\n[ \t]/g, '')

describe('all-day iCalendar export', () => {
  it('writes a complete calendar with stable UID, UTC stamp, and one all-day date', () => {
    const text = createIcs([item], options)
    assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:'))
    assert.ok(text.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n'))
    assert.ok(text.includes('UID:admission@wherecho.co.kr\r\n'))
    assert.ok(text.includes('DTSTAMP:20261101T020304Z\r\n'))
    assert.ok(text.includes('DTSTART;VALUE=DATE:20270302\r\nDURATION:P1D\r\n'))
    assert.equal(text.replace(/\r\n/g, '').includes('\n'), false)
    assert.equal(text.replace(/\r\n/g, '').includes('\r'), false)
  })

  it('escapes text punctuation and every newline shape without injecting properties', () => {
    const text = unfold(createIcs([{ ...item, title: '가,나;다\\라\r\nEND:VEVENT', note: '첫째\r둘째\n셋째,;\\' }], options))
    assert.ok(text.includes('SUMMARY:가\\,나\\;다\\\\라\\nEND:VEVENT\r\n'))
    assert.ok(text.includes('DESCRIPTION:첫째\\n둘째\\n셋째\\,\\;\\\\\\nhttps://wherecho.co.kr/guide/admission-timeline\r\n'))
    assert.equal(text.split('\r\n').filter((line) => line === 'END:VEVENT').length, 1)
  })

  it('folds at 75 octets including continuation spaces, preserving UTF-8 and text', () => {
    for (const title of ['a'.repeat(67) + 'Z'.repeat(100), '가나다'.repeat(50), '가😀나🌷'.repeat(40)]) {
      const text = createIcs([{ ...item, title }], options)
      for (const line of text.split('\r\n')) {
        const bytes = new TextEncoder().encode(line)
        assert.ok(bytes.length <= 75, `physical line is ${bytes.length} bytes`)
        assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(bytes), line)
      }
      assert.ok(unfold(text).includes(`SUMMARY:${title}\r\n`))
      assert.ok(text.includes('\r\n '))
    }
    assert.ok(createIcs([{ ...item, title: 'a'.repeat(67) + 'Z' }], options).includes(`SUMMARY:${'a'.repeat(67)}\r\n Z\r\n`))
  })

  it('accepts leap days and rejects malformed and impossible dates instead of rolling them over', () => {
    assert.ok(createIcs([{ ...item, date: '2028-02-29' }], options).includes('DTSTART;VALUE=DATE:20280229'))
    for (const date of ['2027-02-29', '2027-04-31', '2027-13-01', '2027-00-01', '2027-01-00', '2027-1-02', '27-01-02', '0000-01-01', '2027-03-02T00:00:00Z', '2027-03-02\r\nSUMMARY:bad']) {
      assert.throws(() => createIcs([{ ...item, date }], options), /date/)
    }
  })

  it('keeps the all-day date independent of the timestamp time zone', () => {
    assert.ok(createIcs([item], { generatedAt: new Date('2026-11-01T00:30:00+09:00') }).includes('DTSTAMP:20261031T153000Z'))
    assert.ok(createIcs([item], { generatedAt: new Date('2026-11-01T00:30:00+09:00') }).includes('DTSTART;VALUE=DATE:20270302'))
    assert.throws(() => createIcs([item], { generatedAt: new Date('invalid') }), RangeError)
  })

  it('uses one configured origin in URL and the end of the description', () => {
    const text = unfold(createIcs([{ ...item, url: '/guide/school-notice?a=1,2;b=3', note: '확인하기' }], { ...options, siteOrigin: 'https://example.com/' }))
    const url = 'https://example.com/guide/school-notice?a=1,2;b=3'
    assert.ok(text.includes(`URL:${url}\r\n`)) // URI fields are not TEXT-escaped.
    assert.ok(text.includes('DESCRIPTION:확인하기\\nhttps://example.com/guide/school-notice?a=1\\,2\\;b=3\r\n'))
    assert.ok(!text.includes('https://wherecho.co.kr'))
    assert.ok(unfold(createIcs([item], options)).includes('DESCRIPTION:https://wherecho.co.kr/guide/admission-timeline\r\n'))
  })

  it('rejects external, credentialed, empty, or multiline URLs and invalid site origins', () => {
    for (const url of ['https://external.example/guide', '//external.example/guide', 'javascript:alert(1)', 'https://name:secret@wherecho.co.kr/', '', '/guide\r\nEND:VEVENT']) {
      assert.throws(() => createIcs([{ ...item, url }], options), /URL/)
    }
    for (const siteOrigin of ['javascript:alert(1)', 'https://example.com/path', 'https://user:secret@example.com', 'https://example.com/?q=1', 'https://example.com/#hash']) {
      assert.throws(() => createIcs([item], { ...options, siteOrigin }), /origin/)
    }
  })

  it('requires unique nonempty IDs and titles and safely escapes ID line breaks', () => {
    assert.throws(() => createIcs([item, item], options), /unique/)
    assert.throws(() => createIcs([{ ...item, id: ' ' }], options), /ID/)
    assert.throws(() => createIcs([{ ...item, title: ' ' }], options), /title/)
    assert.ok(createIcs([{ ...item, id: 'a\r\nBAD:value' }], options).includes('UID:a\\nBAD:value@wherecho.co.kr\r\n'))
  })

  it('supports empty input, serializes every item, and never changes inputs', () => {
    assert.equal(createIcs([], options).includes('BEGIN:VEVENT'), false)
    const events = Object.freeze([Object.freeze(item), Object.freeze({ ...item, id: 'care', date: '2027-02-01' })])
    const text = createIcs(events, options)
    assert.equal(text.split('BEGIN:VEVENT').length - 1, 2)
    assert.equal(text, createIcs(events, options))
    assert.equal(generatedAt.toISOString(), '2026-11-01T02:03:04.567Z')
  })
})
