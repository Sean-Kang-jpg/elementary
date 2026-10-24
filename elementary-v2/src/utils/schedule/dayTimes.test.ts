import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { allowedWeekdays, entryForDay, removeEntryDay, repeatEntry, setEntryTimes } from './dayTimes.ts'
import { computeDay } from './engine.ts'
import type { ScheduleEntry } from './types'

const school: ScheduleEntry = { id: 'school', kind: 'school', label: '정규수업', weekdays: [1,2,3,4,5], start: null, end: 780,
  evidence: 'estimated', participation: 'confirmed', source: { ref: 'qa', version: '2026' } }
const care: ScheduleEntry = { id: 'care-qa-afternoon', kind: 'care', label: '오후 돌봄', weekdays: [1,2,3,4,5], start: null, startsAfterSchool: true,
  end: null, evidence: 'estimated', participation: 'planned', source: { ref: 'school_care_hours:qa', version: '2026' } }
const art: ScheduleEntry = { id: 'art', kind: 'afterschool', label: '미술', weekdays: [1], offeredWeekdays: [1,3], start: 840, end: 900,
  evidence: 'school-plan', participation: 'planned', source: { ref: 'school_afterschool:qa', version: '2026' } }
const piano: ScheduleEntry = { id: 'piano', kind: 'personal', label: '피아노', weekdays: [1], start: 960, end: 1020, evidence: 'estimated', participation: 'planned' }
const window = { from: 'dismissal' as const, to: 19 * 60 }

describe('per-weekday times', () => {
  it('changes one weekday of care without touching the others, and the engine places it', () => {
    const next = setEntryTimes([school, care], care.id, [2], { start: 'dismissal', end: 18 * 60 })!
    const saved = next.find((e) => e.id === care.id)!
    assert.deepEqual(saved.weekdays, [1,2,3,4,5])
    assert.deepEqual(saved.dayTimes, { 2: { start: 'dismissal', end: 1080 } })
    assert.equal(computeDay(next, 2, window).blocks.find((b) => b.entry.id === care.id)!.end, 1080)
    // Other days keep the 17:00 planning default.
    assert.equal(computeDay(next, 1, window).blocks.find((b) => b.entry.id === care.id)!.end, 1020)
  })
  it('sets the base time when every weekday is chosen, and records it as a parent override', () => {
    const next = setEntryTimes([care], care.id, [1,2,3,4,5], { start: 800, end: 1050 })!
    assert.equal(next[0].start, 800)
    assert.equal(next[0].startsAfterSchool, false)
    assert.equal(next[0].dayTimes, undefined)
    assert.deepEqual(next[0].userOverride, { start: 800, end: 1050 })
  })
  it('drops a day time that matches the base again', () => {
    const one = setEntryTimes([piano], piano.id, [3], { start: 900, end: 960 })!
    assert.deepEqual(one[0].weekdays, [1,3])
    const back = setEntryTimes(one, piano.id, [3], { start: 960, end: 1020 })!
    assert.equal(back[0].dayTimes, undefined)
  })
  it('refuses a course day the school does not offer and invalid times', () => {
    assert.equal(setEntryTimes([art], art.id, [2], { start: 840, end: 900 }), null)
    assert.ok(setEntryTimes([art], art.id, [3], { start: 840, end: 900 }))
    assert.equal(setEntryTimes([piano], piano.id, [1], { start: 900, end: 900 }), null)
    assert.deepEqual(allowedWeekdays(school), [])
  })
  it('resolves the day entry and removes a single day', () => {
    const one = setEntryTimes([piano], piano.id, [2], { start: 900, end: 960 })!
    assert.equal(entryForDay(one[0], 2).start, 900)
    assert.equal(entryForDay(one[0], 1).start, 960)
    const removed = removeEntryDay(one, piano.id, 2)
    assert.deepEqual(removed[0].weekdays, [1])
    assert.equal(removed[0].dayTimes, undefined)
    assert.deepEqual(removeEntryDay(removed, piano.id, 1), [])
  })
})

describe('repeat one entry on other weekdays', () => {
  it('repeats care with the source day time, leaves other entries alone, and keeps courses to their offered days', () => {
    const tuned = setEntryTimes([school, care, art, piano], care.id, [1], { start: 'dismissal', end: 1080 })!
    const withCare = { ...tuned.find((e) => e.id === care.id)!, weekdays: [1] as ScheduleEntry['weekdays'] }
    const base = tuned.map((e) => e.id === care.id ? withCare : e)
    const next = repeatEntry(base, care.id, 1, [2, 3])!
    const saved = next.find((e) => e.id === care.id)!
    assert.deepEqual(saved.weekdays, [1, 2, 3])
    assert.equal(computeDay(next, 3, window).blocks.find((b) => b.entry.id === care.id)!.end, 1080)
    assert.deepEqual(next.find((e) => e.id === 'piano'), piano)
    assert.deepEqual(repeatEntry(next, 'art', 1, [2, 3])!.find((e) => e.id === 'art')!.weekdays, [1, 3])
    assert.equal(repeatEntry(next, 'art', 1, [2]), null)
    assert.equal(repeatEntry(next, 'school', 1, [2]), null)
  })
  it('repeats a manual entry with its own time on the new day', () => {
    const next = repeatEntry([piano], piano.id, 1, [4])!
    assert.deepEqual(next[0].weekdays, [1, 4])
    assert.equal(next[0].dayTimes, undefined)
    assert.equal(computeDay(next, 4, window).blocks[0].start, 960)
  })
})
