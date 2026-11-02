// 실행: npm run test:unit
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { SchoolCareHours } from '../../types'
import type { ScheduleEntry } from './types'
import { planCoverage } from './coverage.ts'
import { afternoonCareFor, answerReturn, coverageUntil, emptyStarter, eveningCareFor, readStarter, starterStep } from './starter.ts'

const care = (afternoon_end: string | null, extended_end: string | null, status: SchoolCareHours['status'] = 'stated'): SchoolCareHours => ({
  school_id: 'S1', source_year: 2026, status, afternoon_end, extended_end, extended_condition: null, morning_hours: null, grades: null, source: '학교알리미',
})
const school: ScheduleEntry = {
  id: 'school-S1', kind: 'school', label: '정규수업', weekdays: [1, 2, 3, 4, 5], start: 540, end: 13 * 60 + 40,
  evidence: 'estimated', participation: 'confirmed',
}

describe('starterStep', () => {
  it('asks the return time first, then care, then courses, then the remaining gaps', () => {
    assert.equal(starterStep(undefined), 'return')
    assert.equal(starterStep(emptyStarter()), 'return')
    assert.equal(starterStep(answerReturn(1140)), 'care')
    assert.equal(starterStep({ ...answerReturn(1140), care: true }), 'courses')
    assert.equal(starterStep({ ...answerReturn(1140), care: true, courses: false }), 'fill')
    assert.equal(starterStep({ ...answerReturn(1140), care: true, courses: false, done: true }), 'done')
  })

  it('does not ask about care or courses when someone is home at dismissal', () => {
    assert.equal(starterStep(answerReturn('dismissal')), 'done')
  })
})

describe('coverageUntil', () => {
  it('counts gaps only until the return time', () => {
    assert.equal(coverageUntil(answerReturn(1020)), 1020)
    assert.equal(coverageUntil(answerReturn('dismissal')), null)
    assert.equal(coverageUntil(undefined), 19 * 60)
  })
})

describe('afternoonCareFor', () => {
  it('runs to the published end when the family returns later', () => {
    const entry = afternoonCareFor('S1', care('17:00', '19:00'), 1140)
    assert.equal(entry.end, 17 * 60)
    assert.equal(entry.participation, 'planned')
    assert.equal(entry.timeAssumption, undefined)
  })

  it('fills to 19:00 at schools whose afternoon care already runs that late', () => {
    const entry = afternoonCareFor('S1', care('19:00', null), 1140)
    assert.equal(entry.end, 19 * 60)
    assert.equal(planCoverage([school, entry], 1140).state, 'covered')
  })

  it('leaves care at the return time and says so', () => {
    const entry = afternoonCareFor('S1', care('17:00', null), 900)
    assert.equal(entry.end, 900)
    assert.match(entry.timeAssumption ?? '', /15시 귀가/)
  })

  it('assumes 17:00 when the school has not published its hours', () => {
    const entry = afternoonCareFor('S1', null, 1140)
    assert.equal(entry.end, 17 * 60)
    assert.match(entry.timeAssumption ?? '', /기본 가정/)
    assert.deepEqual(planCoverage([school, entry], 1140), { state: 'gaps', until: 1140, days: [1, 2, 3, 4, 5], minutes: 5 * 120 })
  })
})

describe('eveningCareFor', () => {
  it('offers evening care only where both hours are published and afternoon care ends first', () => {
    assert.deepEqual([eveningCareFor(care('17:00', '19:00'), 1140)?.start, eveningCareFor(care('17:00', '19:00'), 1140)?.end], [17 * 60, 19 * 60])
    assert.equal(eveningCareFor(care('17:00', '20:00'), 1140)?.end, 19 * 60)
    assert.equal(eveningCareFor(care('17:00', null), 1140), null)
    assert.equal(eveningCareFor(care('19:00', '20:00'), 1140), null)
    assert.equal(eveningCareFor(care(null, '19:00', 'school_check_needed'), 1140), null)
    assert.equal(eveningCareFor(null, 1140), null)
  })
})

describe('readStarter', () => {
  it('keeps valid answers and drops anything else', () => {
    assert.deepEqual(readStarter({ returnAt: 1020, care: true, courses: null, done: false }), { returnAt: 1020, care: true, courses: null, done: false })
    assert.equal(readStarter({ returnAt: 1000, care: true, courses: null, done: false }), undefined)
    assert.equal(readStarter('x'), undefined)
  })
})
