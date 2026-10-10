// 실행: npm run test:unit
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ScheduleEntry, ScheduleException } from './types'
import { applyProposals, computeDate, effectiveEntry, proposeSourceUpdate, weekdayOf } from './overrides.ts'

const window = { from: 'dismissal' as const, to: 18 * 60 }

const school: ScheduleEntry = {
  id: 'school-1', kind: 'school', label: '정규수업', weekdays: [1], start: null, end: 820,
  evidence: 'estimated', participation: 'confirmed', term: 'semester', source: { ref: 'school_day_estimates:B1', version: '2026' },
}
const art: ScheduleEntry = {
  id: 'art', kind: 'afterschool', label: '미술', weekdays: [1, 3], start: 840, end: 900,
  evidence: 'confirmed', participation: 'confirmed', transitionIn: 'confirmed',
}
const taekwondo: ScheduleEntry = {
  id: 'tkd', kind: 'personal', label: '태권도', weekdays: [1, 2, 3, 4, 5], start: 960, end: 1020,
  evidence: 'confirmed', participation: 'confirmed',
}

// 2027-03-08은 월요일, 03-10은 수요일, 03-13은 토요일.
const MON = '2027-03-08'

describe('dates', () => {
  it('reads weekdays without time-zone drift and skips weekends', () => {
    assert.equal(weekdayOf(MON), 1)
    assert.equal(weekdayOf('2027-03-10'), 3)
    assert.equal(weekdayOf('2027-03-13'), null)
    assert.equal(weekdayOf('3월 8일'), null)
    assert.equal(computeDate([school], [], '2027-03-13', window), null)
  })
})

describe('computeDate', () => {
  const entries = [school, art, taekwondo]

  it('cancels one occurrence and leaves the rest of the week alone', () => {
    const cancel: ScheduleException = { id: 'x1', date: MON, kind: 'cancel', entryId: 'art' }
    const monday = computeDate(entries, [cancel], MON, window)
    assert.deepEqual(monday?.plan.blocks.map((block) => block.entry.id), ['school-1', 'tkd'])
    const wednesday = computeDate(entries, [cancel], '2027-03-10', window)
    assert.ok(wednesday?.plan.blocks.some((block) => block.entry.id === 'art'))
  })

  it('moves one occurrence to another time', () => {
    const replace: ScheduleException = { id: 'x2', date: MON, kind: 'replace', entryId: 'tkd', start: 1020, end: 1080 }
    const day = computeDate(entries, [replace], MON, window)
    const block = day?.plan.blocks.find((item) => item.entry.id === 'tkd')
    assert.deepEqual([block?.start, block?.end], [1020, 1080])
    assert.deepEqual(day?.applied.map((item) => item.id), ['x2'])
  })

  it('adds a make-up class on a day the class does not normally run', () => {
    const makeup: ScheduleException = { id: 'mk1', date: '2027-03-09', kind: 'makeup', entryId: 'art', start: 900, end: 960 }
    const tuesday = computeDate(entries, [makeup], '2027-03-09', window)
    const block = tuesday?.plan.blocks.find((item) => item.entry.id === 'mk1')
    assert.equal(block?.entry.label, '미술 보강')
    assert.deepEqual([block?.start, block?.end], [900, 960])
  })

  it('reports a change that points at nothing on that day', () => {
    const wrongDay: ScheduleException = { id: 'x3', date: '2027-03-09', kind: 'cancel', entryId: 'art' }
    const missing: ScheduleException = { id: 'x4', date: MON, kind: 'makeup', entryId: 'gone' }
    const day = computeDate(entries, [wrongDay, missing], '2027-03-09', window)
    assert.deepEqual(day?.unmatched.map((item) => item.id), ['x3'])
    const monday = computeDate(entries, [missing], MON, window)
    assert.deepEqual(monday?.unmatched.map((item) => item.id), ['x4'])
  })

  it('applies the parent’s own edits and keeps deleted entries out', () => {
    const edited = { ...taekwondo, userOverride: { start: 990 } }
    assert.equal(effectiveEntry(edited)?.start, 990)
    assert.equal(effectiveEntry({ ...art, userOverride: { deleted: true } }), null)
    const day = computeDate([school, { ...art, userOverride: { deleted: true } }], [], MON, window)
    assert.deepEqual(day?.plan.blocks.map((block) => block.entry.id), ['school-1'])
  })
})

describe('new source version', () => {
  const v2 = (entry: ScheduleEntry, changes: Partial<ScheduleEntry>): ScheduleEntry => ({
    ...entry, ...changes, source: { ref: entry.source?.ref ?? 'x', version: '2027' },
  })

  it('proposes changes instead of applying them', () => {
    const proposals = proposeSourceUpdate([school], [v2(school, { end: 780 })])
    assert.deepEqual(proposals, [{ kind: 'change', entryId: 'school-1', field: 'end', from: 820, to: 780, version: '2027' }])
  })

  it('turns a change to a field the parent edited into a conflict', () => {
    const edited = { ...school, userOverride: { end: 800 } }
    const [proposal] = proposeSourceUpdate([edited], [v2(school, { end: 780 })])
    assert.equal(proposal.kind, 'conflict')
    const kept = applyProposals([edited], [])
    assert.equal(effectiveEntry(kept[0])?.end, 800)
    const taken = applyProposals([edited], [proposal])
    assert.equal(effectiveEntry(taken[0])?.end, 780)
    assert.equal(taken[0].userOverride, undefined)
    assert.equal(taken[0].source?.version, '2027')
  })

  it('never brings back an entry the parent deleted', () => {
    const deleted = { ...school, userOverride: { deleted: true } }
    const proposals = proposeSourceUpdate([deleted], [v2(school, { end: 780 })])
    assert.deepEqual(proposals, [{ kind: 'kept_deleted', entryId: 'school-1' }])
    assert.equal(effectiveEntry(applyProposals([deleted], proposals)[0]), null)
  })

  it('proposes additions and removals only within the same source', () => {
    const tuesday: ScheduleEntry = { ...school, id: 'school-2', weekdays: [2], end: 780 }
    const proposals = proposeSourceUpdate([school, taekwondo], [v2(tuesday, {})])
    assert.deepEqual(proposals.map((item) => item.kind).sort(), ['add', 'remove'])
    assert.ok(!proposals.some((item) => item.kind === 'remove' && item.entryId === 'tkd'))
    const next = applyProposals([school, taekwondo], proposals)
    assert.deepEqual(next.map((entry) => entry.id).sort(), ['school-2', 'tkd'])
  })
})
