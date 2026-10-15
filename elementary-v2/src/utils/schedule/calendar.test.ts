import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { PlacedBlock } from './engine'
import { CALENDAR_END, CALENDAR_START, careResumptions, layoutCalendarBlocks, scheduleEntrySubject } from './calendar.ts'

const block = (id: string, start: number, end: number): PlacedBlock => ({
  start, end, tentative: true,
  entry: { id, label: id, kind: 'afterschool', weekdays: [1], start, end, evidence: 'school-plan', participation: 'planned' },
})

describe('12:00–19:00 calendar layout', () => {
  it('uses subject icons with safe fallbacks without altering the label', () => {
    for (const [label, subject] of [['미술', 'art'], ['피아노', 'music'], ['축구', 'sports'], ['코딩', 'coding'], ['과학', 'science'], ['영어', 'reading'], ['수학', 'math'], ['발레', 'dance'], ['알 수 없는 수업', 'activities']]) {
      const entry = { kind: 'afterschool' as const, label }
      assert.equal(scheduleEntrySubject(entry), subject)
      assert.equal(entry.label, label)
    }
    assert.equal(scheduleEntrySubject({ kind: 'school', label: '정규수업' }), 'school')
    assert.equal(scheduleEntrySubject({ kind: 'care', label: '오후 돌봄' }), 'care')
    assert.equal(scheduleEntrySubject({ kind: 'personal', label: '약속' }), 'personal')
  })
  it('clips the drawing while preserving the original times and drops wholly outside intervals', () => {
    const early = block('early', 11 * 60 + 30, 12 * 60 + 30)
    const late = block('late', 18 * 60, 20 * 60)
    const result = layoutCalendarBlocks([early, late, block('before', 10 * 60, 12 * 60), block('after', 19 * 60, 20 * 60)])
    assert.deepEqual(result.map((item) => [item.from, item.to]), [[CALENDAR_START, 750], [1080, CALENDAR_END]])
    assert.equal(result[0].block.start, 690)
    assert.equal(result[1].block.end, 1200)
    assert.equal(early.start, 690)
  })

  it('shows simultaneous care and courses in distinct columns', () => {
    const result = layoutCalendarBlocks([block('care', 780, 1020), block('art', 840, 900), block('custom', 870, 930)])
    assert.equal(new Set(result.map((item) => item.lane)).size, 3)
    assert.ok(result.every((item) => item.lanes === 3))
  })

  it('reuses lanes at an exact handoff and gives disconnected groups their full width', () => {
    const result = layoutCalendarBlocks([block('care', 780, 1020), block('first', 840, 900), block('second', 900, 960), block('later', 1050, 1110)])
    assert.equal(result.find((item) => item.block.entry.id === 'first')?.lane, result.find((item) => item.block.entry.id === 'second')?.lane)
    assert.equal(result.find((item) => item.block.entry.id === 'later')?.lanes, 1)
  })

  it('never turns a zero-length or reversed interval into a visible block', () => {
    assert.deepEqual(layoutCalendarBlocks([block('zero', 840, 840), block('reversed', 900, 840)]), [])
  })

  it('keeps care and classes together and resumes care after the last overlapping class', () => {
    const care = { ...block('care', 780, 1020), entry: { ...block('care', 780, 1020).entry, kind: 'care' as const } }
    const first = block('custom', 840, 900)
    const last = block('art', 900, 960)
    const result = careResumptions([care, first, last])
    assert.equal(result.length, 1)
    assert.equal(result[0].after.entry.id, 'art')
    assert.deepEqual([result[0].from, result[0].to], [960, 1020])
    assert.equal(care.start, 780)
    assert.equal(care.end, 1020)
  })

  it('does not claim remaining care when a class ends after care closes', () => {
    const care = { ...block('care', 780, 1020), entry: { ...block('care', 780, 1020).entry, kind: 'care' as const } }
    assert.deepEqual(careResumptions([care, block('late', 990, 1080)]), [])
    assert.deepEqual(careResumptions([care, block('unrelated', 1080, 1110)]), [])
  })
})
