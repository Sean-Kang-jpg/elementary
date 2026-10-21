import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { careDependencyIssues } from './careDependency.ts'
import type { ScheduleEntry } from './types'

// 돌봄 내 맞춤형: 돌봄 1반에서 월·수에 운영(전동초처럼 "돌봄 내 맞춤형 프로그램")
const custom: ScheduleEntry = { id: 'play', kind: 'afterschool', label: '맞춤형 놀이체육', weekdays: [1, 3], start: 780, end: 860,
  evidence: 'school-plan', participation: 'planned', requiresCare: true }
const care = (weekdays: ScheduleEntry['weekdays'], participation: ScheduleEntry['participation'] = 'planned'): ScheduleEntry => ({
  id: `care-${weekdays.join('')}`, kind: 'care', label: '오후 돌봄', weekdays, start: null, end: 1020, startsAfterSchool: true,
  evidence: 'estimated', participation })

describe('맞춤형 run inside 돌봄 needs 돌봄 that day', () => {
  it('flags each weekday with no care entry', () => {
    assert.deepEqual(careDependencyIssues([custom]), [
      { entryId: 'play', weekday: 1, reason: 'no_care' },
      { entryId: 'play', weekday: 3, reason: 'no_care' },
    ])
  })
  it('is satisfied by planned or candidate care on the same days', () => {
    assert.deepEqual(careDependencyIssues([custom, care([1, 2, 3, 4, 5])]), [])
    assert.deepEqual(careDependencyIssues([custom, care([1, 3], 'considering')]), [])
  })
  it('flags care that was not selected or was cancelled, and only the uncovered day', () => {
    assert.deepEqual(careDependencyIssues([custom, care([1], 'rejected')]), [
      { entryId: 'play', weekday: 1, reason: 'care_inactive' },
      { entryId: 'play', weekday: 3, reason: 'no_care' },
    ])
  })
  it('ignores entries that do not need care, and dropped ones', () => {
    assert.deepEqual(careDependencyIssues([{ ...custom, requiresCare: false }]), [])
    assert.deepEqual(careDependencyIssues([{ ...custom, participation: 'cancelled' }]), [])
    assert.deepEqual(careDependencyIssues([{ ...custom, userOverride: { deleted: true } }]), [])
  })
})
