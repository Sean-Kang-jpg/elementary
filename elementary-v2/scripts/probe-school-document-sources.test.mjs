import test from 'node:test'
import assert from 'node:assert/strict'
import { assertPublicSource, discoverLinks } from './probe-school-document-sources.mjs'
const base = 'https://hs-e.goesn.kr/hs-e/na/ntt/selectNttList.do?bbsId=12782&mi=15066'
test('only allowlisted HTTPS public school sources', () => {
  assert.equal(assertPublicSource(base).hostname, 'hs-e.goesn.kr')
  for (const url of ['http://hs-e.goesn.kr/', 'https://example.com/', 'https://user:password@hs-e.goesn.kr/']) assert.throws(() => assertPublicSource(url))
})
test('actual same-origin href is preserved; scripts and cross-origin omitted', () => {
  const html = '<a href="/fileDown.do?id=1&amp;type=pdf">계획.pdf</a><a href="https://evil.example/download">no</a><a href="javascript:void(0)">no</a>'
  assert.deepEqual(discoverLinks(html, base), [{ url: 'https://hs-e.goesn.kr/fileDown.do?id=1&type=pdf', title: '계획.pdf' }])
})
test('observed action and numeric post button resolve without guessed route', () => {
  const html = `<a href="javascript:" data-id="123" class="nttInfoBtn">2026 계획</a><script>$("#srchForm").attr('action', "/hs-e/na/ntt/selectNttInfo.do?mi=15066&bbsId=12782&nttSn="+nttSn).submit();</script>`
  assert.equal(discoverLinks(html, base)[0].url, 'https://hs-e.goesn.kr/hs-e/na/ntt/selectNttInfo.do?mi=15066&bbsId=12782&nttSn=123')
})
test('no observed action means no invented post URL', () => assert.deepEqual(discoverLinks('<a href="javascript:" data-id="123" class="nttInfoBtn">계획</a>', base), []))
test('duplicate source links are collapsed', () => assert.equal(discoverLinks('<a href="/download?id=1">계획</a><a href="/download?id=1">계획</a>', base).length, 1))
