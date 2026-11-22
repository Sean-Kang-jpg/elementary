import { test } from 'node:test'
import assert from 'node:assert/strict'
import { naverMapSearchUrl, naverSearchName } from './naverMapLink.ts'

test('drops corporate marks and parenthesised notes', () => {
  assert.equal(naverSearchName('(주)한빛 태권도장'), '한빛 태권도장')
  assert.equal(naverSearchName('광교수학학원(본관)'), '광교수학학원')
  assert.equal(naverSearchName('주식회사 리틀스윔 [수영]'), '리틀스윔')
})

test('searches district plus name', () => {
  assert.equal(
    naverMapSearchUrl('한빛태권도장', '수원시 영통구'),
    `https://map.naver.com/p/search/${encodeURIComponent('수원시 영통구 한빛태권도장')}`,
  )
})

test('keeps the raw name when cleaning empties it, and works without a district', () => {
  assert.equal(naverMapSearchUrl('(주)'), `https://map.naver.com/p/search/${encodeURIComponent('(주)')}`)
  assert.equal(naverMapSearchUrl('리틀스윔', ' '), `https://map.naver.com/p/search/${encodeURIComponent('리틀스윔')}`)
})
