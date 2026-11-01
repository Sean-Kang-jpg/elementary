// 실행: npm run test:unit
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ScheduleEntry } from './types'
import { describeCoverage, planCoverage } from './coverage.ts'

const entry = (overrides: Partial<ScheduleEntry> & Pick<ScheduleEntry, 'id' | 'kind'>): ScheduleEntry => ({
  label: overrides.id,
  weekdays: [1, 2, 3, 4, 5],
  start: null,
  end: null,
  evidence: 'confirmed',
  participation: 'confirmed',
  ...overrides,
})

const school = entry({ id: 'school', kind: 'school', end: 13 * 60 })
const careUntil = (end: number, extra: Partial<ScheduleEntry> = {}) =>
  entry({ id: 'care', kind: 'care', startsAfterSchool: true, end, ...extra })

describe('week coverage', () => {
  it('is covered when care runs from dismissal to seven every weekday', () => {
    assert.deepEqual(planCoverage([school, careUntil(19 * 60)]), { state: 'covered', until: 19 * 60 })
  })

  it('counts the days and minutes left open', () => {
    const coverage = planCoverage([school, careUntil(17 * 60, { weekdays: [1, 2, 3, 4] }), careUntil(19 * 60, { id: 'late', weekdays: [5] })])
    assert.deepEqual(coverage, { state: 'gaps', until: 19 * 60, days: [1, 2, 3, 4], minutes: 4 * 120 })
  })

  it('claims nothing when a dismissal is unknown', () => {
    assert.equal(planCoverage([entry({ id: 'school', kind: 'school', end: null }), careUntil(19 * 60)]).state, 'unknown')
  })

  it('claims nothing when the only open time hangs on an untimed activity', () => {
    const untimed = entry({ id: 'class', kind: 'personal', start: null, end: null })
    assert.equal(planCoverage([school, careUntil(17 * 60), untimed]).state, 'unknown')
  })

  it('ignores candidates the family has not chosen', () => {
    const considering = careUntil(19 * 60, { id: 'maybe', participation: 'considering' })
    assert.equal(planCoverage([school, careUntil(17 * 60), considering]).state, 'gaps')
  })

  it('says it the same way everywhere', () => {
    assert.equal(describeCoverage({ state: 'covered', until: 19 * 60 }), '평일 19시까지 빈 시간 없음 ✓')
    assert.equal(describeCoverage({ state: 'gaps', until: 19 * 60, days: [1, 3], minutes: 150 }), '19시까지 빈 시간 월·수 합계 2시간 30분')
    assert.equal(describeCoverage({ state: 'gaps', until: 19 * 60, days: [5], minutes: 40 }), '19시까지 빈 시간 금 합계 40분')
  })
})
