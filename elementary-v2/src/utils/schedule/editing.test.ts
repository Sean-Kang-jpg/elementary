import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ScheduleEntry } from './types'
import { applyCalendarChange, calendarRange, movedCalendarRange, snapCalendarTime } from './editing.ts'

const original: ScheduleEntry = { id: 'piano', label: '피아노', kind: 'personal', weekdays: [1, 3], start: 840, end: 900, participation: 'applying', evidence: 'estimated', term: 'semester' }
const change = { original, fromWeekday: 1 as const, weekday: 2 as const, start: 905, end: 965, label: original.label, kind: 'personal' as const }

describe('direct calendar editing', () => {
  it('uses five-minute selection including reverse drags and the closing boundary', () => {
    assert.equal(snapCalendarTime(842), 840)
    assert.equal(snapCalendarTime(844), 845)
    assert.deepEqual(calendarRange(1, 844), { weekday: 1, start: 845, end: 905 })
    assert.deepEqual(calendarRange(1, 905, 842), { weekday: 1, start: 840, end: 905 })
    assert.deepEqual(calendarRange(1, 1140), { weekday: 1, start: 1135, end: 1140 })
  })
  it('keeps duration while moving across days and clamps the whole event into the visible window', () => {
    assert.deepEqual(movedCalendarRange(3, 840, 900, 903), { weekday: 3, start: 905, end: 965 })
    assert.deepEqual(movedCalendarRange(3, 840, 900, 1135), { weekday: 3, start: 1080, end: 1140 })
    assert.deepEqual(movedCalendarRange(3, 842, 885, 1135), { weekday: 3, start: 1095, end: 1138 })
    assert.equal(movedCalendarRange(3, 0, 1000, 840), null)
  })
  it('splits only the grabbed weekday and keeps participation and other weekdays', () => {
    const result = applyCalendarChange([original], change, 'piano-tuesday')
    assert.ok(result.ok)
    assert.deepEqual(result.entries[0], { ...original, weekdays: [3] })
    assert.deepEqual(result.entry.weekdays, [2])
    assert.equal(result.entry.start, 905)
    assert.equal(result.entry.participation, 'applying')
    assert.deepEqual(original.weekdays, [1, 3])
  })
  it('keeps a single-day identity and avoids splitting when nothing changed', () => {
    const single = { ...original, weekdays: [1 as const] }
    const result = applyCalendarChange([single], { ...change, original: single }, 'unused')
    assert.ok(result.ok)
    assert.equal(result.entry.id, original.id)
    const unchanged = applyCalendarChange([original], { ...change, weekday: 1, start: 840, end: 900 }, 'unused')
    assert.ok(unchanged.ok)
    assert.equal(unchanged.entries.length, 1)
  })
  it('never edits source-backed entries or overwrites another tab’s newer change', () => {
    const sourced = { ...original, source: { ref: 'school_afterschool:S1', version: '2026' } }
    assert.deepEqual(applyCalendarChange([sourced], { ...change, original: sourced }, 'new'), { ok: false, reason: 'protected' })
    assert.deepEqual(applyCalendarChange([{ ...original, end: 910 }], change, 'new'), { ok: false, reason: 'stale' })
    assert.deepEqual(applyCalendarChange([], change, 'new'), { ok: false, reason: 'stale' })
  })
  it('creates a user-owned candidate and rejects an invalid interval without mutating the plan', () => {
    const result = applyCalendarChange([], { weekday: 1, start: 845, end: 905, kind: 'personal', label: '  도서관  ' }, 'new')
    assert.ok(result.ok)
    assert.equal(result.entry.label, '도서관')
    assert.equal(result.entry.source, undefined)
    assert.equal(result.entry.participation, 'considering')
    assert.deepEqual(applyCalendarChange([original], { ...change, start: 965, end: 905 }, 'new'), { ok: false, reason: 'invalid' })
  })
})
