// 실행: npm run test:unit
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeInstagramUrl } from './instagram.ts'

describe('normalizeInstagramUrl', () => {
  it('keeps one canonical shape for posts and reels', () => {
    assert.deepEqual(normalizeInstagramUrl('https://www.instagram.com/p/DAbc_12-x/'), { url: 'https://www.instagram.com/p/DAbc_12-x/', kind: 'p' })
    assert.deepEqual(normalizeInstagramUrl('instagram.com/reel/C9xyz'), { url: 'https://www.instagram.com/reel/C9xyz/', kind: 'reel' })
  })

  it('drops share-sheet tails, account prefixes and the /reels/ spelling', () => {
    assert.equal(normalizeInstagramUrl('https://www.instagram.com/reel/C9xyz/?igsh=abc123')?.url, 'https://www.instagram.com/reel/C9xyz/')
    assert.equal(normalizeInstagramUrl('https://www.instagram.com/wherecho/p/DAbc/')?.url, 'https://www.instagram.com/p/DAbc/')
    assert.equal(normalizeInstagramUrl('https://instagram.com/reels/C9xyz/')?.url, 'https://www.instagram.com/reel/C9xyz/')
  })

  it('refuses anything that is not a single post', () => {
    assert.equal(normalizeInstagramUrl('https://www.instagram.com/wherecho/'), null)
    assert.equal(normalizeInstagramUrl('https://www.instagram.com/explore/tags/어디초/'), null)
    assert.equal(normalizeInstagramUrl('https://evil.example/p/DAbc/'), null)
    assert.equal(normalizeInstagramUrl('https://www.instagram.com.evil.example/p/DAbc/'), null)
    assert.equal(normalizeInstagramUrl('그냥 글자'), null)
  })
})
