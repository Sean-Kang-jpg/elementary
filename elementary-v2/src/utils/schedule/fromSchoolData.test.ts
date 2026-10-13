// 실행: npm run test:unit
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { SchoolAfterschoolOption } from '../../types'
import { afterschoolEntryFromSection } from './fromSchoolData.ts'

const option: SchoolAfterschoolOption = {
  kind: '방과후', name: '컴퓨터', variant: '컴기초', category: 'STEM', grade1: 'true',
  sections: [{ section: 'A', grade1: 'true', grade_upper: 2, days: '수목', start: '13:00', end: '14:20' }],
}

describe('afterschoolEntryFromSection', () => {
  it('turns a section with weekdays into a candidate from the school plan', () => {
    const entry = afterschoolEntryFromSection('S1', 2026, option, option.sections[0])
    assert.ok(entry)
    assert.deepEqual(entry.weekdays, [3, 4])
    assert.equal(entry.start, 13 * 60)
    assert.equal(entry.end, 14 * 60 + 20)
    assert.equal(entry.evidence, 'school-plan')
    assert.equal(entry.participation, 'considering')
    assert.equal(entry.label, '컴퓨터 (컴기초) · A')
    assert.equal(entry.source?.ref, 'school_afterschool:S1')
  })

  it('needs a weekday and does not trust a missing or reversed time', () => {
    assert.equal(afterschoolEntryFromSection('S1', 2026, option, { section: null, grade1: 'true', grade_upper: 2, days: null, start: '13:00', end: '14:00' }), null)
    const reversed = afterschoolEntryFromSection('S1', 2026, option, { section: null, grade1: 'true', grade_upper: 2, days: '금', start: '15:00', end: '14:00' })
    assert.equal(reversed?.start, null)
    assert.equal(reversed?.end, null)
    assert.equal(reversed?.evidence, 'unknown')
    const endOnly = afterschoolEntryFromSection('S1', 2026, { ...option, kind: '맞춤형', variant: null }, { section: null, grade1: 'true', grade_upper: 2, days: '월', start: null, end: '14:40' })
    assert.equal(endOnly?.evidence, 'unknown')
    assert.equal(endOnly?.label, '맞춤형 컴퓨터')
  })
})
