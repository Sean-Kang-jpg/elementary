import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { withCarePlanningDefaults } from './carePlanning.ts'
import { computeDay } from './engine.ts'
import { careResumptions } from './calendar.ts'
import { dayTimelineItems } from './dayTimeline.ts'
import type { ScheduleEntry } from './types'

const entry = (id: string, label: string, extra: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  id, label, kind: 'care', weekdays: [1], start: null, end: null, evidence: 'unknown', participation: 'planned', ...extra,
})

describe('missing care hours in a draft', () => {
  it('places old saved selections chronologically, without mutating their source data', () => {
    const entries = [entry('afternoon', '오후 돌봄'), entry('morning', '아침 돌봄'),
      entry('school', '정규수업', { kind: 'school', end: 780, participation: 'confirmed' }),
      entry('art', '미술', { kind: 'afterschool', start: 840, end: 900 }),
      entry('evening', '저녁·연장 돌봄', { start: 1020, end: 1140 })]
    const before = JSON.stringify(entries)
    const day = computeDay(entries, 1, { from: 'dismissal', to: 1140 })
    assert.equal(day.unplaced.length, 0)
    assert.deepEqual(dayTimelineItems(day, entries).map(item => item.entry.id), ['morning', 'school', 'afternoon', 'art', 'evening'])
    assert.deepEqual(day.blocks.filter(block => block.entry.timeAssumption).map(block => [block.start, block.end, block.entry.evidence]), [[480, 540, 'estimated'], [780, 1020, 'estimated']])
    assert.deepEqual(careResumptions(day.blocks).map(({ from, to }) => [from, to]), [[900, 1020]])
    assert.equal(day.overlaps.filter(overlap => overlap.type === 'conflict').length, 0)
    assert.equal(JSON.stringify(entries), before)
  })

  it('preserves known times, explicit edits, vacations and unrelated unknown courses', () => {
    for (const original of [entry('known', '오후 돌봄', { end: 960 }),
      entry('edited', '오후 돌봄', { userOverride: { end: null } }),
      entry('vacation', '오후 돌봄', { term: 'vacation' }),
      entry('course', '과학', { kind: 'afterschool' })]) assert.equal(withCarePlanningDefaults(original), original)
  })

  it('does not invent school dismissal when it is absent', () => {
    const day = computeDay([entry('care', '오후 돌봄')], 1, { from: 'dismissal', to: 1140 })
    assert.equal(day.unplaced[0].reason, 'dismissal_unknown')
    assert.equal(day.window, null)
    const item = dayTimelineItems(day, [entry('care', '오후 돌봄')])[0]
    assert.equal(item.section, 'afternoon')
    assert.deepEqual([item.start, item.end], [null, 1020])
  })
})
