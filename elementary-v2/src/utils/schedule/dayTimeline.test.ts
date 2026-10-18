import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeDay } from './engine.ts'
import { dayTimelineItems } from './dayTimeline.ts'
import type { ScheduleEntry } from './types'

const entry = (id: string, extra: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  id, label: id, kind: 'personal', weekdays: [1], start: 840, end: 900,
  evidence: 'estimated', participation: 'planned', ...extra,
})
const items = (entries: ScheduleEntry[], weekday: 1 | 2 = 1) => dayTimelineItems(computeDay(entries, weekday, { from: 'dismissal', to: 1140 }), entries)
describe('reference-style day timeline', () => {
  it('orders morning, compressed school and afternoon without inventing a school start', () => {
    const entries = [entry('music', { start: 965, end: 1025 }), entry('school', { kind: 'school', start: null, end: 780 }),
      entry('morning', { kind: 'care', start: 450, end: 520 }), entry('art')]
    const snapshot = JSON.stringify(entries)
    const result = items(entries)
    assert.deepEqual(result.map(({ entry, section }) => [entry.id, section]), [['morning', 'morning'], ['school', 'school'], ['art', 'afternoon'], ['music', 'afternoon']])
    assert.equal(result[1].start, null)
    assert.equal(result[1].end, 780)
    assert.equal(result[3].start, 965)
    assert.equal(JSON.stringify(entries), snapshot)
  })
  it('keeps unknown morning care before school and unknown programs in a separate section', () => {
    const result = items([entry('school', { kind: 'school', start: null, end: null }),
      entry('unknown-course', { start: null }), entry('unknown-morning', { kind: 'care', label: '아침 돌봄', start: null, end: null })])
    assert.deepEqual(result.map(({ entry }) => entry.id), ['unknown-morning', 'school', 'unknown-course'])
    assert.ok(result.every(({ start, end }) => start === null && end === null))
  })
  it('resolves after-dismissal care and preserves overlap with selected courses and candidates', () => {
    const result = items([entry('school', { kind: 'school', end: 780 }), entry('care', { kind: 'care', startsAfterSchool: true, start: null, end: 1020 }),
      entry('course'), entry('candidate', { participation: 'considering', start: 905, end: 940 })])
    assert.deepEqual(result.map(({ entry }) => entry.id), ['school', 'care', 'course', 'candidate'])
    assert.equal(result[1].start, 780)
    assert.equal(result[3].entry.participation, 'considering')
  })
  it('does not show other weekdays, vacation-only, cancelled or rejected entries', () => {
    assert.deepEqual(items([entry('tuesday', { weekdays: [2] }), entry('vacation', { term: 'vacation' }),
      entry('cancelled', { participation: 'cancelled' }), entry('rejected', { participation: 'rejected' })]), [])
    assert.equal(items([entry('tuesday', { weekdays: [2] })], 2).length, 1)
  })
})
