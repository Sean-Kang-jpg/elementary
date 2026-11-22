import assert from 'node:assert/strict'
import test from 'node:test'
import type { SchoolAfterschool, SchoolAfterschoolSlot, SchoolDayEstimate } from '../../types'
import { dismissalForPickup, pickupGap, pickupProgramOptions, pickupTimeMinutes } from './pickupPreview.ts'

test('pickup preview handles gaps, zero, early pickup and missing dismissal', () => {
  assert.deepEqual(pickupGap(1020, 860), { result: 'gap', minutes: 160 })
  assert.deepEqual(pickupGap(860, 860), { result: 'same', minutes: 0 })
  assert.deepEqual(pickupGap(859, 860), { result: 'early', minutes: -1 })
  assert.deepEqual(pickupGap(1020, null), { result: 'unknown', minutes: null })
  assert.equal(pickupTimeMinutes('13:30:00'), 810)
  assert.equal(pickupTimeMinutes('00:00'), 0)
  assert.equal(pickupTimeMinutes('24:00'), null)
})

test('dismissal preview uses weekday identity and suppresses unconfirmed slots', () => {
  const day: SchoolDayEstimate = {
    school_id: 'B900000001', source_year: 2026, applies_to_entry_year: 2027,
    lunch_position: 'before_p4', lunch_start: null, lunch_end: null,
    clock_source: 'fixture', periods_source: 'fixture', reviewed_on: '2026-11-22',
    weekdays: [
      { weekday: 5, periods: 4, dismissal: '13:30:00', note: 'inferred' },
      { weekday: 2, periods: 4, dismissal: '12:50', note: 'school_check_needed' },
    ],
  }
  assert.equal(dismissalForPickup(day, 5), 810)
  assert.equal(dismissalForPickup(day, 2), null)
  assert.equal(dismissalForPickup(day, 1), null)
})

test('conditional preview only offers eligible programs with complete hours after dismissal', () => {
  const slot: SchoolAfterschoolSlot = { weekday: 5, start: '13:50', end: '14:20', kind: '맞춤형', place: null, time_source: 'plan', courses: [] }
  const data: SchoolAfterschool = { school_id: 'B900000001', source_year: 2026, term: null, note: null, options: [], slots: [
    { ...slot }, { ...slot, weekday: 1 }, { ...slot, place: '돌봄내' },
    { ...slot, start: '13:00' }, { ...slot, end: '14:99' },
    { ...slot, kind: '학년미기재방과후' },
  ], tier: 'A' }
  assert.deepEqual(pickupProgramOptions(data, 5, 810), [{ start: 830, end: 860, kind: '맞춤형', estimated: false }])
})
