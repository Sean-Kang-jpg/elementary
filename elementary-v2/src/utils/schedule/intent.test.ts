// 실행: npm run test:unit
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ScheduleEntry } from './types'
import { computeWeek } from './engine.ts'
import { describeIntents, entryIntent, weekIntentMinutes } from './intent.ts'

const entry = (overrides: Partial<ScheduleEntry> & Pick<ScheduleEntry, 'id' | 'kind'>): ScheduleEntry => ({
  label: overrides.id, weekdays: [1, 2, 3, 4, 5], start: null, end: null,
  evidence: 'confirmed', participation: 'planned', ...overrides,
})
const school = entry({ id: 'school', kind: 'school', start: 540, end: 13 * 60, participation: 'confirmed' })

describe('entryIntent', () => {
  it('derives a default from the kind and subject', () => {
    assert.equal(entryIntent(school), null)
    assert.equal(entryIntent(entry({ id: '오후 돌봄', kind: 'care' })), 'safety')
    assert.equal(entryIntent(entry({ id: '독서 논술', kind: 'afterschool' })), 'basics')
    assert.equal(entryIntent(entry({ id: '방송댄스', kind: 'afterschool' })), 'interest')
    assert.equal(entryIntent(entry({ id: '놀이터', kind: 'personal' })), 'undecided')
  })

  it('keeps what the parent chose', () => {
    assert.equal(entryIntent(entry({ id: '놀이터', kind: 'personal', intent: 'free' })), 'free')
    assert.equal(entryIntent(entry({ id: '오후 돌봄', kind: 'care', intent: 'interest' })), 'interest')
  })
})

describe('weekIntentMinutes', () => {
  it('sums placed time per intent and gives overlaps to the class, not to care', () => {
    const care = entry({ id: '오후 돌봄', kind: 'care', start: 13 * 60, end: 17 * 60 })
    const art = entry({ id: '미술', kind: 'afterschool', weekdays: [1], start: 14 * 60, end: 15 * 60 })
    const totals = weekIntentMinutes(computeWeek([school, care, art], { from: 'dismissal', to: 19 * 60 }))
    assert.deepEqual(totals, { safety: 5 * 240 - 60, basics: 0, interest: 60, free: 0, undecided: 0 })
    assert.equal(describeIntents(totals), '이번 주 안전 19시간 · 관심 1시간')
  })

  it('does not count candidates the family has not planned', () => {
    const maybe = entry({ id: '미술', kind: 'afterschool', start: 14 * 60, end: 15 * 60, participation: 'considering' })
    assert.equal(describeIntents(weekIntentMinutes(computeWeek([school, maybe], { from: 'dismissal', to: 19 * 60 }))), null)
  })
})
