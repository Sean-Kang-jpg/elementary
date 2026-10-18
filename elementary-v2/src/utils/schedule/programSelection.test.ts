import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isProgramDaySelected, toggleProgramDay } from './programSelection.ts'
import type { ScheduleEntry } from './types'
const course: ScheduleEntry = { id: 'art', kind: 'afterschool', label: '미술', weekdays: [1,3], start: 840, end: 900,
  evidence: 'school-plan', participation: 'planned', source: { ref: 'school_afterschool:qa', version: '2026' } }
describe('inline per-weekday program selection', () => {
  it('adds only the selected source weekday, without confirming participation', () => {
    const result = toggleProgramDay([], course, 1)
    assert.deepEqual(result[0].weekdays, [1])
    assert.equal(result[0].participation, 'planned')
    assert.deepEqual(result[0].source, course.source)
    assert.deepEqual(course.weekdays, [1,3])
  })
  it('adds another day and removes just one occurrence using the latest stored entry', () => {
    const monday = toggleProgramDay([], course, 1)
    const both = toggleProgramDay(monday, course, 3)
    assert.deepEqual(both[0].weekdays, [1,3])
    const wednesday = toggleProgramDay(both, course, 1)
    assert.deepEqual(wednesday[0].weekdays, [3])
    assert.equal(isProgramDaySelected(wednesday[0], 1), false)
    assert.equal(isProgramDaySelected(wednesday[0], 3), true)
    assert.deepEqual(toggleProgramDay(wednesday, course, 3), [])
  })
  it('keeps care and courses independently selected, and preserves application status', () => {
    const care: ScheduleEntry = { ...course, id: 'care', kind: 'care', weekdays: [1,2,3,4,5], end: 1020 }
    const result = toggleProgramDay([{ ...course, weekdays: [1], participation: 'applying' }, care], course, 3)
    assert.equal(result.find((entry) => entry.id === 'art')!.participation, 'applying')
    assert.deepEqual(result.find((entry) => entry.id === 'care'), care)
  })
  it('does not revive cancelled weekdays or accept a day absent from the source', () => {
    const result = toggleProgramDay([{ ...course, participation: 'cancelled' }], course, 3)
    assert.deepEqual(result[0].weekdays, [3])
    assert.equal(result[0].participation, 'planned')
    assert.deepEqual(toggleProgramDay([], course, 2), [])
    assert.deepEqual(toggleProgramDay([], { ...course, kind: 'school' }, 1), [])
  })
})
