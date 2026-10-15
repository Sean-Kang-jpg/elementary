import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { morningCalendarView, isMorningCalendarCare } from './morningCalendar.ts'
import { layoutCalendarBlocks } from './calendar.ts'
import type { ScheduleEntry } from './types'

const care: ScheduleEntry = { id: 'morning', kind: 'care', label: '아침 돌봄', weekdays: [1, 3], start: 450, end: 520, evidence: 'school-plan', participation: 'planned', source: { ref: 'school_care_hours:qa:morning', version: '2026' } }
describe('morning calendar with compressed lessons', () => {
  it('keeps the afternoon-only view when no visible morning care was chosen', () => {
    assert.equal(morningCalendarView([]), null)
    assert.equal(morningCalendarView([{ ...care, participation: 'cancelled' }]), null)
    assert.equal(morningCalendarView([{ ...care, participation: 'rejected' }]), null)
    assert.equal(morningCalendarView([{ ...care, term: 'vacation' }]), null)
  })
  it('uses a common morning axis rounded outward without changing source times or weekdays', () => {
    const snapshot = JSON.stringify(care)
    assert.deepEqual(morningCalendarView([care]), { start: 420, end: 540, height: 144, hours: [7, 8, 9], hasUnknown: false })
    assert.equal(JSON.stringify(care), snapshot)
  })
  it('includes earlier/later personal morning plans, not the assumed school start', () => {
    const personal = { ...care, id: 'personal', kind: 'personal' as const, label: '이동', start: 395, end: 430, source: undefined }
    const school = { ...care, id: 'school', kind: 'school' as const, start: 480, end: 780 }
    assert.deepEqual(morningCalendarView([care, personal, school])?.hours, [6, 7, 8, 9])
    assert.equal(morningCalendarView([care, personal, school])?.end, 540)
  })
  it('recognizes directly entered morning care and never invents a clock for unknown times', () => {
    assert.equal(isMorningCalendarCare({ ...care, label: '개인 돌봄', source: undefined }), true)
    assert.deepEqual(morningCalendarView([{ ...care, start: null, end: null }]), { start: null, end: null, height: 0, hours: [], hasUnknown: true })
    assert.equal(morningCalendarView([{ ...care, start: 520, end: 450 }])?.hasUnknown, true)
  })
  it('lays out morning overlaps with the same clipping and lane rules as the afternoon', () => {
    const block = { entry: care, start: 450, end: 520, tentative: true }
    const result = layoutCalendarBlocks([block, { ...block, entry: { ...care, id: 'second' }, start: 480, end: 530 }], { start: 420, end: 540 })
    assert.equal(result.length, 2)
    assert.ok(result.every((item) => item.lanes === 2))
    assert.equal(result[0].from, 450)
    assert.equal(layoutCalendarBlocks([block]).length, 0)
  })
})
